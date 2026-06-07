import LandingPage from "./components/LandingPage";
import FRNDPLAYApp from "./FRNDPLAYApp";

export default function App() {
  const path = window.location.pathname;

  // Everything inside the actual app should go to FRNDPLAYApp
  if (path.startsWith("/app")) {
    return <FRNDPLAYApp />;
  }

  return <LandingPage />;
}