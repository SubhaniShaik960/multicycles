import Vue from 'vue'
import Vuex from 'vuex'
import gql from 'graphql-tag'

import i18n from './i18n'
import apolloProvider from './apollo'
import getlanguage from './language'

Vue.use(Vuex)

const disabledProviders =
  localStorage.getItem('disabledProviders') && JSON.parse(localStorage.getItem('disabledProviders'))
const position = localStorage.getItem('position') && JSON.parse(localStorage.getItem('position'))

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function distanceInKmBetweenEarthCoordinates(lat1, lon1, lat2, lon2) {
  var earthRadiusKm = 6371

  var dLat = degreesToRadians(lat2 - lat1)
  var dLon = degreesToRadians(lon2 - lon1)

  lat1 = degreesToRadians(lat1)
  lat2 = degreesToRadians(lat2)

  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function roundLocation(l) {
  return Math.round(l * 1000) / 1000
}

const state = {
  page: 'home',
  lang: getlanguage(),
  geolocation: position || [48.852775, 2.369336],
  providers: [],
  disabledProviders: disabledProviders || [],
  selectedVehicle: false,
  moved: false,
  map: {
    center: position || [48.852775, 2.369336]
  },
  selectedAddress: {
    name: ''
  },
  myAccount: null,
  activeRides: [],
  roundedLocation: position || [48.852775, 2.369336],
  fixGPS: false,
  zones: []
}

const getters = {
  isProviderDisabled: state => provider => state.disabledProviders.includes(provider),
  enabledProviders: state => [...state.providers].filter(provider => !state.disabledProviders.includes(provider)),
  page: state => state.page
}

const actions = {
  setLang({ commit }, event) {
    commit('setLang', event.target.value)
  },
  setGeolocation({ commit }, position) {
    commit('setGeolocation', position)
  },
  getProviders({ commit }, position = {}) {
    apolloProvider.defaultClient
      .query({
        query: gql`
          query($lat: Float, $lng: Float) {
            providers(lat: $lat, lng: $lng) {
              name
              slug
            }
          }
        `,
        variables: {
          lat: position.lat || this.state.roundedLocation[0],
          lng: position.lng || this.state.roundedLocation[1]
        }
      })
      .then(result => {
        commit('setProviders', result.data.providers)
      })
  },
  toggleProvider({ commit }, provider) {
    commit('toggleProvider', provider)
  },
  selectVehicle({ commit }, vehicle) {
    if (!vehicle) {
      commit('selectVehicle', null)
    } else if (!state.selectedVehicle || vehicle.id !== state.selectedVehicle.id) {
      commit('selectVehicle', null)
      setTimeout(() => {
        commit('selectVehicle', vehicle)
      }, 100)
    }
  },
  centerOnGeolocation({ commit }) {
    commit('centerOnGeolocation')
    commit('clearAddress')
  },
  setMoved({ commit }, moved) {
    commit('setMoved', moved)
  },
  setCenter({ commit }, center) {
    commit('setCenter', center)
    commit('setRoundedLocation', center)
  },
  setAddress({ commit }, address) {
    commit('setAddress', address)
  },
  login({ commit, dispatch }) {
    if (localStorage.getItem('token')) {
      return apolloProvider.defaultClient
        .query({
          fetchPolicy: 'no-cache',
          query: gql`
            query {
              getMyAccount {
                id
                name
                subAccounts {
                  puid
                  status
                  provider {
                    name
                    slug
                  }
                }
              }
            }
          `
        })
        .then(result => {
          commit('setMyAccount', result.data.getMyAccount)
          return dispatch('getActiveRides')
        })
    }
  },
  getActiveRides({ commit }) {
    if (localStorage.getItem('token')) {
      return apolloProvider.defaultClient
        .query({
          query: gql`
            query {
              getMyActiveRides {
                id
                startedAt
                provider {
                  name
                  slug
                }
              }
            }
          `
        })
        .then(result => {
          commit('setActiveRides', result.data.getMyActiveRides)
        })
    }
  },
  startMyRide({ commit, state }, { token, provider }) {
    if (localStorage.getItem('token')) {
      return apolloProvider.defaultClient
        .mutate({
          mutation: gql`
            mutation($provider: String!, $token: String!, $lat: Float!, $lng: Float!) {
              startMyRide(provider: $provider, token: $token, lat: $lat, lng: $lng) {
                id
                startedAt
                provider {
                  name
                  slug
                }
              }
            }
          `,
          variables: {
            token,
            provider,
            lat: state.geolocation[0],
            lng: state.geolocation[1]
          }
        })
        .then(result => {
          commit('setActiveRides', [result.data.startMyRide])
        })
    }
  },
  stopMyRide({ commit, state }, rideId) {
    if (localStorage.getItem('token')) {
      return apolloProvider.defaultClient
        .mutate({
          mutation: gql`
            mutation($rideId: String!, $lat: Float!, $lng: Float!) {
              stopMyRide(rideId: $rideId, lat: $lat, lng: $lng) {
                id
                startedAt
                provider {
                  name
                  slug
                }
              }
            }
          `,
          variables: {
            rideId,
            lat: state.geolocation[0],
            lng: state.geolocation[1]
          }
        })
        .then(() => {
          commit('setActiveRides', null)
        })
    }
  },
  startGeolocation({ commit, state, dispatch }) {
    // request lat lng by ip
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(position => {
        commit('fixGPS')
        dispatch('getProviders', { lat: position.coords.latitude, lng: position.coords.longitude })
        dispatch('getZones', { lat: position.coords.latitude, lng: position.coords.longitude })

        if (!state.moved) {
          state.map.center = [position.coords.latitude, position.coords.longitude]
          state.geolocation = [position.coords.latitude, position.coords.longitude]

          commit('setRoundedLocation', [position.coords.latitude, position.coords.longitude])
        }
      })

      navigator.geolocation.watchPosition(position => {
        state.geolocation = [position.coords.latitude, position.coords.longitude]

        if (!state.moved) {
          state.map.center = [position.coords.latitude, position.coords.longitude]
          commit('setRoundedLocation', [position.coords.latitude, position.coords.longitude])
        }
      })
    }
  },
  getZones({ commit }, position) {
    apolloProvider.defaultClient
      .query({
        query: gql`
          query($lat: Float!, $lng: Float!, $types: [ZoneType]) {
            zones(lat: $lat, lng: $lng, types: $types) {
              id
              name
              types
              geojson
              provider {
                name
                slug
              }
            }
          }
        `,
        variables: {
          ...position,
          types: ['parking', 'no_parking', 'no_ride', 'ride']
        }
      })
      .then(result => {
        commit('setZones', result.data.zones)
      })
  },
  missingProvider({ state }, provider) {
    apolloProvider.defaultClient.mutate({
      mutation: gql`
        mutation missingProvider($provider: String!, $lat: Float!, $lng: Float!) {
          missingProvider(provider: $provider, lat: $lat, lng: $lng) {
            provider
          }
        }
      `,
      variables: {
        provider,
        lat: state.geolocation[0],
        lng: state.geolocation[1]
      }
    })
  }
}

const mutations = {
  setPage(state, page) {
    state.page = page
  },
  setLang(state, lang) {
    localStorage.setItem('lang', lang)
    i18n.locale = lang
    state.lang = lang
  },
  setGeolocation(state, position) {
    localStorage.setItem('position', JSON.stringify(position))
    state.geolocation = position
  },
  setProviders(state, providers) {
    state.providers = providers
  },
  toggleProvider(state, provider) {
    if (state.disabledProviders.includes(provider)) {
      state.disabledProviders.splice(state.disabledProviders.indexOf(provider), 1)
    } else {
      state.disabledProviders.push(provider)
    }

    localStorage.setItem('disabledProviders', JSON.stringify(state.disabledProviders))
  },
  selectVehicle(state, vehicle) {
    state.selectedVehicle = vehicle
  },
  centerOnGeolocation(state) {
    const geolocation = state.geolocation

    if (geolocation) {
      state.moved = false
      state.map.center = JSON.parse(JSON.stringify(geolocation))

      state.roundedLocation = [roundLocation(state.map.center[0]), roundLocation(state.map.center[1])]

      history.pushState(null, null, `/?l=${state.map.center.join(',')}`)
    }
  },
  setMoved(state, moved) {
    state.moved = moved
  },
  setCenter(state, center) {
    state.map.center = center
  },
  setAddress(state, address) {
    const position = address.geometry.coordinates
    state.selectedAddress = { name: address.place_name, position: position.reverse() }
  },
  clearAddress(state) {
    state.selectedAddress = { name: '' }
  },
  setMyAccount(state, myAccount) {
    Vue.set(state, 'myAccount', myAccount)
  },
  setActiveRides(state, rides) {
    state.activeRides = rides
  },
  setRoundedLocation(state, center) {
    const diff = distanceInKmBetweenEarthCoordinates(
      state.roundedLocation[0],
      state.roundedLocation[1],
      center[0],
      center[1]
    )

    if (diff > 0.2) {
      state.roundedLocation = [roundLocation(center[0]), roundLocation(center[1])]
    }
  },
  fixGPS(state) {
    state.fixGPS = true
  },
  setZones(state, zones) {
    state.zones = zones
  }
}

export default new Vuex.Store({
  state,
  getters,
  actions,
  mutations
})
