import { GraphQLObjectType, GraphQLList, GraphQLFloat, GraphQLString } from 'graphql'

import yobike from '@multicycles/yobike'

import config from '../config'
import bicycleType from './bicycleType'

const yobikeType = new GraphQLObjectType({
  name: 'Yobike',
  interfaces: [bicycleType],
  fields: {
    id: { type: GraphQLString },
    lat: { type: GraphQLFloat },
    lng: { type: GraphQLFloat }
  }
})

const getBicyclesByLatLng = {
  type: new GraphQLList(yobikeType),
  async resolve({ lat, lng }, args) {
    const result = await yobike.getBicyclesByLatLng({
      lat,
      lng
    })

    return result.data.data.map(bike => ({
      id: bike.plate_no,
      lat: bike.latitude,
      lng: bike.longitude
    }))
  }
}

export default {
  getBicyclesByLatLng
}
