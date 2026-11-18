import { IUser } from "@/types/user";
import Sidebar from "../shared/Sidebar";
import { ReactNode, useEffect, useState } from "react";
import { getMe } from "@/handlers/api/user.handler";
import UserContext from "@/contexts/CurrentUserContext";
import ErrorBlock from "../shared/ErrorBlock";
import Loader from "../ui/loader";
import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { LoginForm } from "../auth/LoginForm";
import { useConfig } from "@/contexts/ConfigContext";
import { Toaster } from "../ui/sonner";
import { useRouter } from "next/router";

type RootLayoutProps = {
  children: ReactNode;
};


export default function RootLayout({ children }: RootLayoutProps) {
  const { immichURL, exImmichUrl } = useConfig();
  const router = useRouter();
  const { pathname } = router;
  const [user, setUser] = useState<IUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<{
    error: string;
    message: string;
  } | null>(null);

  const fetchData = () => {
    return getMe()
      .then(setUser)
      .catch((error) => {
        if (error.status === 403) return setUser(null);
        return setErrorMessage(error);
      })
      .finally(() => setLoading(false));
  };

  const handleLoginCompletion = (user: IUser) => setUser(user);

  useEffect(() => {
    fetchData();
  }, []);


  if (loading) return <Loader />;
  if (errorMessage)
    return (
      <div className="min-h-screen flex flex-col justify-center">
        <ErrorBlock
          icon={<TriangleAlert />}
          title={errorMessage.error}
          description={errorMessage.message}
          action={
            <div className="flex flex-col items-center">
              <Link
                className="flex items-center gap-2 text-xs"
                href={
                  "https://github.com/varun-raj/immich-power-tools?tab=readme-ov-file#-getting-started"
                }
                target="_blank"
              >
                Setup Instructions
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="text-xs flex flex-col gap-4 py-4 w-full">
                <div className="text-center">
                  <p className="text-muted-foreground font-mono">Connected to (External)</p>
                  <Link href={exImmichUrl || ""} target="_blank" className="font-mono">
                    {exImmichUrl || "Not Set"}
                  </Link>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground font-mono">Connected to (Internal)</p>
                  <Link href={immichURL} target="_blank" className="font-mono">
                    {immichURL}
                  </Link>
                </div>
              </div>
            </div>
          }
        />
      </div>
    );


  if (pathname.startsWith("/s/")) {
    return (
        <div className="grid max-h-screen min-h-screen w-full">
          <div className="flex flex-col">{children}</div>
          <Toaster />
        </div>
    )
  }
  if (!user) return <LoginForm onLogin={handleLoginCompletion} />;

  return (
      <UserContext.Provider value={{
        ...user,
        updateContext: setUser,
      }}>
        <div className="grid max-h-screen min-h-screen w-full md:grid-cols-[200px_1fr] lg:grid-cols-[240px_1fr]">
          <Sidebar />
          <div className="flex flex-col">{children}</div>
          <Toaster />
        </div>
      </UserContext.Provider>
  );
}
