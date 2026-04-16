import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { defineCustomElements } from '@ionic/pwa-elements/loader';

  createRoot(document.getElementById("root")!).render(<App />);
  defineCustomElements(window);