export default function MessageBubble({ message }) {

  const isUser = message.role === "user";

  return (

    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>

      <div
        className={`max-w-lg p-4 rounded-lg ${
          isUser
            ? "bg-blue-600"
            : "bg-gray-800"
        }`}
      >
        {message.content}
      </div>

    </div>
  );
}