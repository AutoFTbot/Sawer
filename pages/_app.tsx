import type { AppProps } from 'next/app';
import '../styles/viaQris.css'; 
function autoftbot({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default autoftbot;
