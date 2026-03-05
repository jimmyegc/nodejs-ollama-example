import axios from "axios";

export const askAgent = async (question) => {
  const res = await axios.post("http://localhost:9000/agent", {
    question
  });

  return res.data.result;
};