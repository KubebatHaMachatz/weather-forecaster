import { setupServer } from 'msw/node'
import { handlers } from './handlers.js'

/** Shared MSW server for src/api's Node-based tests. */
export const server = setupServer(...handlers)
