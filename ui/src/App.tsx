import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import SigninForm from './_auth/forms/SigninForm'
import AuthLayout from './_auth/AuthLayout'
import RootLayout from './_root/RootLayout'
import PostLayout from './_root/PostLayout'
import PrivateRoute from './routes/PrivateRoute'
import AnnotProvider from './context/AnnotContext'
import {
  Queue,
  Study,
  Batch,
  Reports,
  Service,
  Soon,
  Post,
  Setup,
  AnnotQueue,
  Annot,
  Training,
  Tuning,
} from './_root/pages'

const App = () => {
  return (
    <main className="flex min-h-screen flex-col">
      <Routes>
        {/* public routes */}
        <Route element={<AuthLayout />}>
          <Route path="sign-in" element={<SigninForm />} />
        </Route>

        {/* scope A — radiographer station */}
        <Route element={<PrivateRoute scope="post" />}>
          <Route element={<PostLayout />}>
            <Route path="/post" element={<Post />} />
            {/* settings of the room: intake mode, shift, statistics, log */}
            <Route path="/setup" element={<Setup />} />
          </Route>
        </Route>

        {/* scope B — processing centre */}
        <Route element={<PrivateRoute scope="center" />}>
          <Route element={<RootLayout />}>
            <Route index element={<Queue />} />
            <Route path="/study/:jobId" element={<Study />} />
            <Route path="/batch" element={<Batch />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/service" element={<Service />} />
            {/* The annotation contour: the source filter is one thing across
                the queue and the desk, so both sit inside one provider. */}
            <Route
              element={
                <AnnotProvider>
                  <Outlet />
                </AnnotProvider>
              }
            >
              <Route path="/markup" element={<AnnotQueue />} />
              <Route path="/markup/frame" element={<Annot />} />
            </Route>
            <Route path="/training" element={<Training />} />
            <Route path="/tuning" element={<Tuning />} />
            <Route path="/analytics" element={<Soon section="analytics" />} />
            <Route path="/cases" element={<Soon section="cases" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  )
}

export default App
