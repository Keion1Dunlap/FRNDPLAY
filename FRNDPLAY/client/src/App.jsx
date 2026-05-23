import LandingPage from "./components/LandingPage";
import FRNDPLAYApp from "./FRNDPLAYApp";

export default function App() {
  const path = window.location.pathname;

  if (path.startsWith("/app")) {
    return <FRNDPLAYApp />;
  }

  return <LandingPage />;
}