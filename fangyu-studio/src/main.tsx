import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { App, store, initPlatform } from '@fangyu/canvas'
import '@fangyu/canvas/styles/global.css'

initPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
