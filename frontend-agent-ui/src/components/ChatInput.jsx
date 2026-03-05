import { useForm } from "react-hook-form";

export default function ChatInput({ onSend }) {

  const { register, handleSubmit, reset } = useForm();

  const submit = (data) => {
    onSend(data.message);
    reset();
  };

  return (

    <form
      onSubmit={handleSubmit(submit)}
      className="p-4 border-t border-gray-800 flex gap-2"
    >

      <input
        {...register("message")}
        placeholder="Pregunta algo..."
        className="flex-1 bg-gray-900 p-3 rounded"
      />

      <button className="bg-blue-600 px-6 rounded">
        Enviar
      </button>

    </form>
  );
}