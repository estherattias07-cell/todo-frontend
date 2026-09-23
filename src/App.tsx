import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const API_URL = 'http://localhost:3000/todos';

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Récupérer toutes les tâches
  useEffect(() => {
    async function loadTodos() {
      try {
        const response = await fetch(API_URL);

        if (!response.ok) {
          throw new Error('Impossible de récupérer les tâches');
        }

        const data: Todo[] = await response.json();
        setTodos(data);
      } catch (error) {
        if (error instanceof Error) {
          setError(error.message);
        }
      } finally {
        setLoading(false);
      }
    }

    loadTodos();
  }, []);

  // Créer une nouvelle tâche
  async function createTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newTitle.trim() === '') {
      return;
    }

    try {
      setError('');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Impossible de créer la tâche');
      }

      const createdTodo: Todo = await response.json();

      setTodos((currentTodos) => [...currentTodos, createdTodo]);
      setNewTitle('');
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      }
    }
  }

  // Changer le statut d’une tâche
  async function toggleTodo(todo: Todo) {
    try {
      setError('');

      const response = await fetch(`${API_URL}/${todo.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          completed: !todo.completed,
        }),
      });

      if (!response.ok) {
        throw new Error('Impossible de modifier le statut');
      }

      const updatedTodo: Todo = await response.json();

      setTodos((currentTodos) =>
        currentTodos.map((currentTodo) =>
          currentTodo.id === updatedTodo.id
            ? updatedTodo
            : currentTodo,
        ),
      );

      if (selectedTodo?.id === updatedTodo.id) {
        setSelectedTodo(updatedTodo);
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      }
    }
  }

  // Modifier le titre d’une tâche
  async function editTodo(todo: Todo) {
    const newTodoTitle = window.prompt(
      'Entrez le nouveau titre :',
      todo.title,
    );

    if (newTodoTitle === null || newTodoTitle.trim() === '') {
      return;
    }

    try {
      setError('');

      const response = await fetch(`${API_URL}/${todo.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTodoTitle.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Impossible de modifier la tâche');
      }

      const updatedTodo: Todo = await response.json();

      setTodos((currentTodos) =>
        currentTodos.map((currentTodo) =>
          currentTodo.id === updatedTodo.id
            ? updatedTodo
            : currentTodo,
        ),
      );

      if (selectedTodo?.id === updatedTodo.id) {
        setSelectedTodo(updatedTodo);
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      }
    }
  }

  // Supprimer une tâche
  async function deleteTodo(id: number) {
    const confirmation = window.confirm(
      'Voulez-vous vraiment supprimer cette tâche ?',
    );

    if (!confirmation) {
      return;
    }

    try {
      setError('');

      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Impossible de supprimer la tâche');
      }

      setTodos((currentTodos) =>
        currentTodos.filter((todo) => todo.id !== id),
      );

      if (selectedTodo?.id === id) {
        setSelectedTodo(null);
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      }
    }
  }

  // Récupérer et afficher le détail d’une tâche
  async function showTodoDetails(id: number) {
    try {
      setError('');

      const response = await fetch(`${API_URL}/${id}`);

      if (!response.ok) {
        throw new Error(
          'Impossible de récupérer le détail de la tâche',
        );
      }

      const todoDetails: Todo = await response.json();
      setSelectedTodo(todoDetails);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      }
    }
  }

  if (loading) {
    return <p>Chargement des tâches...</p>;
  }

  return (
    <main>
      <h1>Mes tâches</h1>

      {error && (
        <p className="error-message">
          Erreur : {error}
        </p>
      )}

      <form onSubmit={createTodo}>
        <input
          type="text"
          placeholder="Titre de la nouvelle tâche"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />

        <button type="submit">
          Ajouter
        </button>
      </form>

      {selectedTodo && (
        <section className="todo-details">
          <h2>Détail de la tâche</h2>

          <p>
            <strong>Numéro :</strong> {selectedTodo.id}
          </p>

          <p>
            <strong>Titre :</strong> {selectedTodo.title}
          </p>

          <p>
            <strong>État :</strong>{' '}
            {selectedTodo.completed ? 'TERMINÉE' : 'À FAIRE'}
          </p>

          <button
            className="button-close"
            onClick={() => setSelectedTodo(null)}
          >
            Fermer
          </button>
        </section>
      )}

      {todos.length === 0 ? (
        <p>Aucune tâche pour le moment.</p>
      ) : (
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>
              <div className="todo-information">
                <span className="todo-title">
                  {todo.title}
                </span>

                <strong className="todo-status">
                  {todo.completed ? 'TERMINÉE' : 'À FAIRE'}
                </strong>
              </div>

              <div className="todo-actions">
                <button
                  className="button-details"
                  onClick={() => showTodoDetails(todo.id)}
                >
                  Voir le détail
                </button>

                <button
                  className="button-edit"
                  onClick={() => editTodo(todo)}
                >
                  Modifier
                </button>

                <button
                  className="button-toggle"
                  onClick={() => toggleTodo(todo)}
                >
                  {todo.completed
                    ? 'Remettre à faire'
                    : 'Terminer'}
                </button>

                <button
                  className="button-delete"
                  onClick={() => deleteTodo(todo.id)}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default App;