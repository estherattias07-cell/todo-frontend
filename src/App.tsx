import { useEffect, useState } from 'react';
import './App.css';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('http://localhost:3000/todos')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Impossible de récupérer les tâches');
        }

        return response.json();
      })
      .then((data: Todo[]) => {
        setTodos(data);
      })
      .catch((error: Error) => {
        setError(error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p>Chargement des tâches...</p>;
  }

  if (error) {
    return <p>Erreur : {error}</p>;
  }

  return (
    <main>
      <h1>Mes tâches</h1>

      {todos.length === 0 ? (
        <p>Aucune tâche pour le moment.</p>
      ) : (
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>
              {todo.title} — {todo.completed ? 'Terminée' : 'À faire'}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default App;
