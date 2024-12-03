import { INodeParams, INodeCredential } from '../src/Interface'

class RedisCacheApi implements INodeCredential {
    label: string
    name: string
    version: number
    description: string
    inputs: INodeParams[]

    constructor() {
        this.label = 'Redis API'
        this.name = 'redisCacheApi'
        this.version = 1.0
        this.inputs = [
            {
                label: 'Redis Host',
                name: 'redisCacheHost',
                type: 'string',
                default: process.env.REDIS_HOST
            },
            {
                label: 'Port',
                name: 'redisCachePort',
                type: 'number',
                default: process.env.REDIS_PORT
            },
            {
                label: 'User',
                name: 'redisCacheUser',
                type: 'string',
                placeholder: '<REDIS_USER>'
            },
            {
                label: 'Password',
                name: 'redisCachePwd',
                type: 'password',
                placeholder: '<REDIS_PASSWORD>'
            },
            {
                label: 'Use SSL',
                name: 'redisCacheSslEnabled',
                type: 'boolean'
            }
        ]
    }
}

module.exports = { credClass: RedisCacheApi }
