import { contextBridge } from 'electron'

/**
 * The functions that the screens of Shifted can call. Later prompts add functions here.
 * The preload script never gives a page access to Node.js or to the file system.
 */
const shifted = Object.freeze({})

contextBridge.exposeInMainWorld('shifted', shifted)
