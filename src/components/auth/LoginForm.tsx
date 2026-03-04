import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEffect, useState } from "react"
import { loginUser } from "@/handlers/api/user.handler"
import { useConfig } from "@/contexts/ConfigContext"
import { IUser } from "@/types/user"
import Head from "next/head"
import { useRouter } from "next/router"

export const description =
  "A login form with email and password. There's an option to login with Google and a link to sign up if you don't have an account."

interface ILoginFormProps {
  onLogin: (user: IUser) => void
}
export function LoginForm(
  { onLogin }: ILoginFormProps
) {
  const { exImmichUrl, oauthEnabled, oauthButtonText } = useConfig()
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check for error in query parameters
  useEffect(() => {
    if (router.query.error) {
      setErrorMessage(router.query.error as string);

    // Clear the error from the URL without refreshing
      const { error, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
  }, [router.query.error]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setErrorMessage(null)
    loginUser(formData.email, formData.password)
      .then(onLogin)
      .catch((error) => {
        setErrorMessage(error.message)
    }).finally(() => {
        setLoading(false)
      })
  }

  const handleOAuthLogin = () => {
    window.location.assign("/api/auth/oauth/authorize")
  }

  return (
    <>
      <Head>
        <title>Immich Power Tools - Login</title>
      </Head>
      <div className="relative flex min-h-screen justify-center flex-col bg-background">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <img
              src="/favicon.png"
              width={32}
              height={32}
              alt="Immich Power Tools"
              className="w-8 h-8"
            />
            <CardTitle className="text-2xl">Login to Immich</CardTitle>
            <CardDescription>
              Login to your connected Immich instance <Link href={exImmichUrl} className="text-xs" target="_blank">({exImmichUrl})</Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit}>
              {errorMessage && (
                <div className="border text-center border-red-500 text-red-500 p-2 rounded-lg text-xs" role="alert">
                  <p>{errorMessage}</p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  onChange={handleChange}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required 
                  onChange={handleChange}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Login
              </Button>
              {oauthEnabled && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or continue with
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleOAuthLogin}
                  >
                    {oauthButtonText}
                  </Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
