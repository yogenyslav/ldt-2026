import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { z } from 'zod'
import Button from '@/components/ui/button'
import Input from '@/components/ui/input'
import Label from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useUserContext } from '@/context/AuthContext'
import { SigninValidationSchema } from '@/lib/validation'
import ApiAuth from '@/services/apiAuth'

/* The contour is decided by the account: the login of a clinic technologist
   opens the station, the login of a centre radiologist opens the queue. */

const SigninForm = () => {
  const { toast } = useToast()
  const { setIsAuth, setScope } = useUserContext()
  const navigate = useNavigate()
  const [reveal, setReveal] = useState(false)

  const form = useForm<z.infer<typeof SigninValidationSchema>>({
    resolver: zodResolver(SigninValidationSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: z.infer<typeof SigninValidationSchema>) {
    try {
      const scope = await ApiAuth.loginUser(values)
      setScope(scope)
      setIsAuth(true)
      form.reset()
      navigate(scope === 'post' ? '/post' : '/')
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      return toast({
        title: status === 401 ? 'Неверный логин или пароль' : 'Не удалось войти. Попробуйте снова',
        variant: 'destructive',
      })
    }
  }

  return (
    <form className="w-full max-w-[400px]" onSubmit={form.handleSubmit(onSubmit)}>
      <h2 className="mb-7 text-[32px] font-bold tracking-[-0.03em]">Вход в систему</h2>

      <div className="mb-3.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          autoComplete="email"
          type="email"
          placeholder="name@example.com"
          {...form.register('email')}
        />
        {form.formState.errors.email ? (
          <p className="mt-1.5 small-regular text-bad">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="mb-3.5">
        <Label htmlFor="password">Пароль</Label>
        <div className="relative">
          <Input
            id="password"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="pr-12"
            {...form.register('password')}
          />
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            title={reveal ? 'Скрыть пароль' : 'Показать пароль'}
            aria-label={reveal ? 'Скрыть пароль' : 'Показать пароль'}
            className="flex-center absolute top-0 right-0 h-12 w-12 cursor-pointer text-muted transition-colors hover:text-ink-2"
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {form.formState.errors.password ? (
          <p className="mt-1.5 small-regular text-bad">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? 'Проверяем…' : 'Войти'}
      </Button>

      <p className="mt-7 border-t border-line pt-6 small-regular text-muted">
        Доступ выдаёт администратор организации. Если войти не получается, обратитесь в центр
        обработки.
      </p>
    </form>
  )
}

export default SigninForm
