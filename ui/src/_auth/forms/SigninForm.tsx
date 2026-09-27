import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Activity, List } from 'lucide-react'
import { z } from 'zod'
import Button from '@/components/ui/button'
import Input from '@/components/ui/input'
import Label from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useUserContext } from '@/context/AuthContext'
import { SigninValidationSchema } from '@/lib/validation'
import ApiAuth from '@/services/apiAuth'

const DEMO_ACCOUNTS = [
  {
    username: 'ivanova',
    name: 'Иванова А. П.',
    role: 'рентгенолаборант, поликлиника № 218',
    icon: Activity,
  },
  {
    username: 'sokolova',
    name: 'Соколова М. И.',
    role: 'врач-рентгенолог, центр обработки',
    icon: List,
  },
]

const SigninForm = () => {
  const { toast } = useToast()
  const { setIsAuth, setScope } = useUserContext()
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof SigninValidationSchema>>({
    resolver: zodResolver(SigninValidationSchema),
    defaultValues: { username: '', password: '' },
  })

  async function onSubmit(values: z.infer<typeof SigninValidationSchema>) {
    try {
      const scope = await ApiAuth.loginUser(values)
      setScope(scope)
      setIsAuth(true)
      form.reset()
      navigate(scope === 'post' ? '/post' : '/')
    } catch {
      return toast({
        title: 'Ошибка авторизации. Попробуйте снова',
        variant: 'destructive',
      })
    }
  }

  const enterAs = (username: string) => {
    form.setValue('username', username)
    form.setValue('password', 'demo')
    void form.handleSubmit(onSubmit)()
  }

  return (
    <form className="w-full max-w-[400px]" onSubmit={form.handleSubmit(onSubmit)}>
      <h2 className="mb-7 text-[32px] font-bold tracking-[-0.03em]">Вход в систему</h2>

      <div className="mb-3.5">
        <Label htmlFor="username">Логин</Label>
        <Input id="username" placeholder="фамилия.и.о" {...form.register('username')} />
        {form.formState.errors.username ? (
          <p className="mt-1.5 small-regular text-bad">{form.formState.errors.username.message}</p>
        ) : null}
      </div>

      <div className="mb-3.5">
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" type="password" placeholder="••••••••" {...form.register('password')} />
        {form.formState.errors.password ? (
          <p className="mt-1.5 small-regular text-bad">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" variant="primary" size="lg" className="w-full">
        Войти
      </Button>

      <div className="mt-8 flex flex-col gap-2.5 border-t border-line pt-7">
        {DEMO_ACCOUNTS.map((account) => {
          const Icon = account.icon
          return (
            <button
              key={account.username}
              type="button"
              onClick={() => enterAs(account.username)}
              className="group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-transparent bg-surface-2 px-4 py-3.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-050"
            >
              <span className="flex-center h-10 w-10 flex-none rounded-xl bg-brand-050 text-brand">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1 base-semibold">
                {account.name}
                <span className="block small-regular font-normal text-muted">{account.role}</span>
              </span>
              <ArrowRight size={16} className="text-line-2 group-hover:text-brand" />
            </button>
          )
        })}
      </div>
    </form>
  )
}

export default SigninForm
