import RootLayout from "@/components/layouts/RootLayout";
import "@/styles/globals.scss";
import type { AppProps } from "next/app";
import { ThemeProvider } from "next-themes";
import { ENV } from "@/config/environment";
import ConfigContext, { ConfigContextType } from "@/contexts/ConfigContext";
import { useRef } from "react";
import { queryClient } from "@/config/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
interface AppPropsWithProps extends AppProps {
  props: ConfigContextType;
}
const App = ({ Component, pageProps, ...props }: AppPropsWithProps) => {
  const intialData = useRef(props.props);

  return (
    <ConfigContext.Provider value={intialData.current}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" storageKey="theme">
          <RootLayout>
            <Component {...pageProps} />
          </RootLayout>
        </ThemeProvider>
      </QueryClientProvider>
    </ConfigContext.Provider>
  );
};

App.getInitialProps = async () => {

  return {
    props: {
      exImmichUrl: ENV.EXTERNAL_IMMICH_URL,
      immichURL: ENV.IMMICH_URL,
      version: ENV.VERSION,
      aiEnabled: !!ENV.AI_API_KEY?.length && !!ENV.AI_MODEL?.length,
      oauthEnabled: ENV.OAUTH_ENABLED,
      oauthButtonText: ENV.OAUTH_BUTTON_TEXT,
    },
  };
};

export default App;
