import { Navigate, Route, Routes } from 'react-router-dom'
import SigninForm from './_auth/forms/SigninForm'
import AuthLayout from './_auth/AuthLayout'
import RootLayout from './_root/RootLayout'
import PostLayout from './_root/PostLayout'
import PrivateRoute from './routes/PrivateRoute'
import { Queue, Study, Batch, Reports, Service, Soon, Post, Setup } from './_root/pages'

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
            <Route path="/markup" element={<Soon section="markup" />} />
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
