import { createBrowserRouter } from "react-router-dom";
import ChatPage from "../pages/ChatPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <ChatPage />
  }
]);