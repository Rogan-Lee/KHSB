// Groq 채팅 모델 단일 소스. Groq는 모델을 주기적으로 폐기(decommission)하며,
// 폐기되면 chat.completions가 404를 던진다. 교체 시 여기 한 줄만 바꾼다.
// 활성 모델 확인: GET https://api.groq.com/openai/v1/models
export const GROQ_MODEL = "openai/gpt-oss-120b";
