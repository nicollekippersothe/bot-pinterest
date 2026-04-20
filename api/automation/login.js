export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Para Vercel, vamos usar uma abordagem diferente
    // Como as funções são stateless, vamos armazenar o estado em memória temporária
    // ou usar uma solução de cache externa

    res.status(200).json({ success: true, message: 'Login preparado' });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro no login' });
  }
}