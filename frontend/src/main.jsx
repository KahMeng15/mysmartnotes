import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import './index.css'
import App from './App.jsx'
import { MantineProvider, createTheme } from '@mantine/core'

const theme = createTheme({
  fontFamily: 'Instrument Sans, sans-serif',
  headings: { fontFamily: 'Instrument Sans, sans-serif' },
  primaryColor: 'smartpurple',
  colors: {
    smartpurple: [
      '#f2f0f8',
      '#e2dcf0',
      '#c4b5e2',
      '#a38cd3',
      '#866bc6',
      '#7354be',
      '#6847ba',
      '#593c8f', // Index 7: main primary
      '#4f3481',
      '#432b73',
    ]
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </StrictMode>,
)
