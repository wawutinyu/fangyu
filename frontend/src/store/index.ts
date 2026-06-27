import { configureStore } from '@reduxjs/toolkit'
import flowReducer from './flowSlice'
import settingsReducer from './settingsSlice'
import saveReducer from './saveSlice'

export const store = configureStore({
  reducer: {
    flow: flowReducer,
    settings: settingsReducer,
    saves: saveReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
