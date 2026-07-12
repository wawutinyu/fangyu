import { configureStore } from '@reduxjs/toolkit'
import flowReducer from './flowSlice'
import settingsReducer from './settingsSlice'
import saveReducer from './saveSlice'
import agentReducer from './agentSlice'

export const store = configureStore({
  reducer: {
    flow: flowReducer,
    settings: settingsReducer,
    saves: saveReducer,
    agent: agentReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
