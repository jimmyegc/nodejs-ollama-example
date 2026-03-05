import { useMutation } from "@tanstack/react-query";
import { askAgent } from "../api/agentApi";

export function useAgent() {
  return useMutation({
    mutationFn: askAgent
  });
}