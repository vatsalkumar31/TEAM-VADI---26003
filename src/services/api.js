import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000"
});

export const predictRisk = async (data) => {
  const response = await API.post("/predict", data);
  return response;
};
export const analyzeAudio = (formData) => API.post("/analyze_audio", formData, { headers: { "Content-Type": "multipart/form-data" } });