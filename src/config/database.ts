export interface QueryResult {
  id: number;
  nome: string;
  email: string;
}

export const db = {
  async query(sql: string, params?: unknown[]): Promise<QueryResult[]> {
    console.log(`[Database Mock] Executando query: "${sql}"`, params ? `Parâmetros: ${JSON.stringify(params)}` : '');
    return [
      { id: 1, nome: 'Thiago Nunes', email: 'thiago@example.com' }
    ];
  }
};
