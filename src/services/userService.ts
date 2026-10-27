import { db } from '../config/database.js';

export async function buscarUsuario(nome: string) {
  // VULNERABILIDADE INTENCIONAL: SQL Injection
  // O desenvolvedor (na pressa de entregar) concatenou a string direto.
  const query = `SELECT id, nome, email FROM usuarios WHERE nome = '${nome}'`;
  const result = await db.query(query);
  return result;
}
