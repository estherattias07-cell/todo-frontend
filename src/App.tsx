import { useEffect, useState } from 'react';
import './App.css';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
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
  async function toggleTodo(todo: Todo) {
  const response = await fetch(`http://localhost:3000/todos/${todo.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      completed: !todo.completed,
    }),
  });

  if (!response.ok) {
    setError('Impossible de modifier la tâche');
    return;
  }

  const updatedTodo: Todo = await response.json();

  setTodos((currentTodos) =>
    currentTodos.map((currentTodo) =>
      currentTodo.id === updatedTodo.id ? updatedTodo : currentTodo,
    ),
  );
}

  if (loading) {
    return <p>Chargement des tâches...</p>;
  }

  if (error) {
    return <p>Erreur : {error}</p>;
  }

  return (
    <main>
      <h1>Mes tâches</h1>
      <form onSubmit={createTodo}>
  <input
    type="text"
    placeholder="Titre de la nouvelle tâche"
    value={newTitle}
    onChange={(event) => setNewTitle(event.target.value)}
  />

  <button type="submit">Ajouter</button>
</form>

      {todos.length === 0 ? (
        <p>Aucune tâche pour le moment.</p>
      ) : (
        <ul>
        {todos.map((todo) => (
  <li key={todo.id}>
    {todo.title} — {todo.completed ? 'Terminée' : 'À faire'}

    <button onClick={() => toggleTodo(todo)}>
      {todo.completed ? 'Remettre à faire' : 'Terminer'}
    </button>
  </li>
))}
        </ul>
      )}
    </main>
  );
  async function createTodo(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!newTitle.trim()) {
    return;
  }

  const response = await fetch('http://localhost:3000/todos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: newTitle,
    }),
  });

  if (!response.ok) {
    setError('Impossible de créer la tâche');
    return;
  }

  const createdTodo: Todo = await response.json();

  setTodos((currentTodos) => [...currentTodos, createdTodo]);
  setNewTitle('');
}
}

export default App;
