import { RouterProvider } from 'react-router/dom'
import { SessionProvider } from '@/presentation/hooks/SessionProvider'
import { ServicesContext } from '@/presentation/hooks/useServices'
import { ToastProvider } from '@/presentation/ui/Toast'
import { services } from './container'
import { router } from './router'

export function App() {
  return (
    <ServicesContext.Provider value={services}>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </ServicesContext.Provider>
  )
}
