import { useState } from "react";
import { useAgent } from "../hooks/useAgent";
import ChatInput from "../components/ChatInput";
import MessageBubble from "../components/MessageBubble";

export default function ChatPage() {

  const agent = useAgent();

  const [messages, setMessages] = useState([]);

  const handleSend = (text) => {

    setMessages(prev => [
      ...prev,
      { role: "user", content: text }
    ]);

    agent.mutate(text, {
      onSuccess: (data) => {

        setMessages(prev => [
          ...prev,
          { role: "assistant", content: data }
        ]);

      }
    });
  };

  return (

    <div className="h-screen bg-gray-950 text-white flex flex-col">

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

      </div>

      <ChatInput onSend={handleSend} />

    </div>
  );
}