import { Redis, RedisOptions } from 'ioredis'
import { isEqual } from 'lodash'
import hash from 'object-hash'
import { RedisCache as LangchainRedisCache } from '@langchain/community/caches/ioredis'
import { StoredGeneration, mapStoredMessageToChatMessage } from '@langchain/core/messages'
import { Generation, ChatGeneration } from '@langchain/core/outputs'
import { getBaseClasses, getCredentialData, getCredentialParam, ICommonObject, INode, INodeData, INodeParams } from '../../../src'

let redisClientSingleton: Redis
let redisClientOption: RedisOptions
let redisClientUrl: string

const getRedisClientbyOption = (option: RedisOptions) => {
    if (!redisClientSingleton) {
        // if client doesn't exists
        redisClientSingleton = new Redis(option)
        redisClientOption = option
        return redisClientSingleton
    } else if (redisClientSingleton && !isEqual(option, redisClientOption)) {
        // if client exists but option changed
        redisClientSingleton.quit()
        redisClientSingleton = new Redis(option)
        redisClientOption = option
        return redisClientSingleton
    }
    return redisClientSingleton
}

const getRedisClientbyUrl = (url: string) => {
    if (!redisClientSingleton) {
        // if client doesn't exists
        redisClientSingleton = new Redis(url)
        redisClientUrl = url
        return redisClientSingleton
    } else if (redisClientSingleton && url !== redisClientUrl) {
        // if client exists but option changed
        redisClientSingleton.quit()
        redisClientSingleton = new Redis(url)
        redisClientUrl = url
        return redisClientSingleton
    }
    return redisClientSingleton
}

class RedisCache implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    inputs: INodeParams[]
    credential: INodeParams

    constructor() {
        this.label = 'Redis Cache'
        this.name = 'redisCache'
        this.version = 1.0
        this.type = 'RedisCache'
        this.description = 'Cache LLM response in Redis, useful for sharing cache across multiple processes or servers'
        this.icon = 'redis.svg'
        this.category = 'Cache'
        this.baseClasses = [this.type, ...getBaseClasses(LangchainRedisCache)]
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            optional: true,
            credentialNames: ['redisCacheApi', 'redisCacheUrlApi']
        }
        this.inputs = [
            {
                label: 'Time to Live (ms)',
                name: 'ttl',
                type: 'number',
                step: 1,
                optional: true,
                additionalParams: true
            }
        ]
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
    const ttl = nodeData.inputs?.ttl as string;

    const credentialData = await getCredentialData(nodeData.credential ?? '', options);
    const redisUrl = getCredentialParam('redisUrl', credentialData, nodeData) || process.env.REDIS_URL;

    const username = getCredentialParam('redisCacheUser', credentialData, nodeData) || process.env.REDIS_USER;
    const password = getCredentialParam('redisCachePwd', credentialData, nodeData) || process.env.REDIS_PASSWORD;
    const portStr = getCredentialParam('redisCachePort', credentialData, nodeData) || process.env.REDIS_PORT;
    const host = getCredentialParam('redisCacheHost', credentialData, nodeData) || process.env.REDIS_HOST;
    const sslEnabled = getCredentialParam('redisCacheSslEnabled', credentialData, nodeData);

    // Définir tlsOptions ici pour qu'elle soit accessible dans les deux blocs
    const tlsOptions = sslEnabled === true ? { tls: { rejectUnauthorized: false } } : {};

    let client: Redis;
    if (!redisUrl || redisUrl === '') {
        client = getRedisClientbyOption({
            port: portStr ? parseInt(portStr) : 6379,
            host,
            username,
            password,
            ...tlsOptions // Utiliser tlsOptions ici
        });
    } else {
        try {
            const url = new URL(redisUrl);
            const port = parseInt(url.port) || 6379;
            const urlHost = url.hostname;

            client = getRedisClientbyOption({
                port,
                host: urlHost,
                username: url.username || process.env.REDIS_USER,
                password: url.password || process.env.REDIS_PASSWORD,
                ...tlsOptions // Utiliser tlsOptions ici
            });
        } catch (error) {
            console.error('URL Redis invalide:', redisUrl);
            throw error;
        }
    }

        const redisClient = new LangchainRedisCache(client)

        redisClient.lookup = async (prompt: string, llmKey: string) => {
            let idx = 0
            let key = getCacheKey(prompt, llmKey, String(idx))
            let value = await client.get(key)
            const generations: Generation[] = []

            while (value) {
                const storedGeneration = JSON.parse(value)
                generations.push(deserializeStoredGeneration(storedGeneration))
                idx += 1
                key = getCacheKey(prompt, llmKey, String(idx))
                value = await client.get(key)
            }

            return generations.length > 0 ? generations : null
        }

        redisClient.update = async (prompt: string, llmKey: string, value: Generation[]) => {
            for (let i = 0; i < value.length; i += 1) {
                const key = getCacheKey(prompt, llmKey, String(i))
                if (ttl) {
                    await client.set(key, JSON.stringify(serializeGeneration(value[i])), 'PX', parseInt(ttl, 10))
                } else {
                    await client.set(key, JSON.stringify(serializeGeneration(value[i])))
                }
            }
        }

        return redisClient
    }
}

const getCacheKey = (...strings: string[]): string => hash(strings.join('_'))
const deserializeStoredGeneration = (storedGeneration: StoredGeneration) => {
    if (storedGeneration.message !== undefined) {
        return {
            text: storedGeneration.text,
            message: mapStoredMessageToChatMessage(storedGeneration.message)
        }
    } else {
        return { text: storedGeneration.text }
    }
}
const serializeGeneration = (generation: Generation) => {
    const serializedValue: StoredGeneration = {
        text: generation.text
    }
    if ((generation as ChatGeneration).message !== undefined) {
        serializedValue.message = (generation as ChatGeneration).message.toDict()
    }
    return serializedValue
}

module.exports = { nodeClass: RedisCache }
