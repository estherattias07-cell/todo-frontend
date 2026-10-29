import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

interface Todo {
  id: number;
  title: string;
  description?: string | null;
  completed: boolean;
  createdAt?: string;
}

interface LoginResponse {
  access_token: string;
  user: {
    id: number;
    email: string;
  };
}

// Adresse du backend : configurable pour le futur déploiement.
// Pour le moment, localhost:3000 reste utilisé par défaut.
const API_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearStoredAuth() {
  try {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('connected_email');
  } catch {
    // La déconnexion en mémoire reste possible.
  }
}

async function getErrorMessage(
  response: Response,
): Promise<string> {
  try {
    const data: unknown = await response.json();

    if (
      typeof data === 'object' &&
      data !== null &&
      'message' in data
    ) {
      const message = data.message;

      if (typeof message === 'string') {
        return message;
      }

      if (Array.isArray(message)) {
        return message
          .filter(
            (item): item is string => typeof item === 'string',
          )
          .join(' ');
      }
    }
  } catch {
    // Certaines réponses ne contiennent pas de JSON.
  }

  return `La demande a échoué (${response.status}).`;
}

function App() {
  const [token, setToken] = useState<string | null>(
    () => readStorage('access_token'),
  );

  const [connectedEmail, setConnectedEmail] = useState(
    () => readStorage('connected_email') ?? '',
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerMode, setRegisterMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const logout = useCallback((expired = false) => {
    clearStoredAuth();
    setToken(null);
    setConnectedEmail('');
    setPassword('');
    setError(
      expired ? 'Ta connexion a expiré. Reconnecte-toi.' : '',
    );
    setMessage('');
  }, []);

  async function submitAuth(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const route = registerMode ? 'register' : 'login';

      const response = await fetch(
        `${API_URL}/auth/${route}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      if (registerMode) {
        setRegisterMode(false);
        setPassword('');
        setMessage(
          'Compte créé ! Connecte-toi avec tes identifiants.',
        );
      } else {
        const data: LoginResponse = await response.json();

        try {
          sessionStorage.setItem(
            'access_token',
            data.access_token,
          );
          sessionStorage.setItem(
            'connected_email',
            data.user.email,
          );
        } catch {
          clearStoredAuth();
          throw new Error(
            'Le navigateur bloque le stockage de la connexion. Vérifie ses paramètres.',
          );
        }

        setConnectedEmail(data.user.email);
        setPassword('');
        setToken(data.access_token);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Impossible de contacter le serveur.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (token) {
    return (
      <TodosPage
        token={token}
        email={connectedEmail}
        onLogout={logout}
      />
    );
  }

  return (
    <main>
      <h1>
        {registerMode ? 'Créer un compte' : 'Connexion'}
      </h1>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {message && <p role="status">{message}</p>}

      <form onSubmit={submitAuth}>
        <label htmlFor="email">Adresse e-mail</label>

        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          required
          disabled={submitting}
        />

        <label htmlFor="password">Mot de passe</label>

        <input
          id="password"
          type="password"
          autoComplete={
            registerMode ? 'new-password' : 'current-password'
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={registerMode ? 12 : 1}
          maxLength={128}
          required
          disabled={submitting}
        />

        {registerMode && (
          <p>Choisis au moins 12 caractères.</p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting
            ? 'Patiente...'
            : registerMode
              ? 'Créer mon compte'
              : 'Se connecter'}
        </button>
      </form>

      <button
        type="button"
        disabled={submitting}
        onClick={() => {
          setRegisterMode((current) => !current);
          setPassword('');
          setError('');
          setMessage('');
        }}
      >
        {registerMode
          ? 'Déjà un compte ? Se connecter'
          : 'Pas de compte ? S’inscrire'}
      </button>
    </main>
  );
}

interface TodosPageProps {
  token: string;
  email: string;
  onLogout: (expired?: boolean) => void;
}

function TodosPage({
  token,
  email,
  onLogout,
}: TodosPageProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        onLogout(true);
        throw new Error('Connexion expirée.');
      }

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      return response;
    },
    [token, onLogout],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadTodos() {
      try {
        const response = await request('/todos', {
          signal: controller.signal,
        });

        const data: Todo[] = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('La liste reçue est incorrecte.');
        }

        if (!controller.signal.aborted) {
          setTodos(data);
        }
      } catch (caughtError) {
        if (!controller.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Impossible de récupérer les tâches.',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadTodos();

    return () => controller.abort();
  }, [request]);

  async function runAction(action: () => Promise<void>) {
    if (busy) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await action();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Une erreur est survenue.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createTodo(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!newTitle.trim()) {
      return;
    }

    await runAction(async () => {
      const response = await request('/todos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
        }),
      });

      const createdTodo: Todo = await response.json();

      setTodos((current) => [...current, createdTodo]);
      setNewTitle('');
      setNewDescription('');
    });
  }

  async function updateTodo(
    id: number,
    changes: {
      title?: string;
      description?: string;
      completed?: boolean;
    },
  ) {
    const response = await request(`/todos/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(changes),
    });

    const updatedTodo: Todo = await response.json();

    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? updatedTodo : todo,
      ),
    );

    setSelectedTodo((current) =>
      current?.id === id ? updatedTodo : current,
    );
  }

  async function editTodo(todo: Todo) {
    const title = window.prompt(
      'Entrez le nouveau titre :',
      todo.title,
    );

    if (title === null || !title.trim()) {
      return;
    }

    const description = window.prompt(
      'Entrez la description (facultative) :',
      todo.description ?? '',
    );

    if (description === null) {
      return;
    }

    await runAction(() =>
      updateTodo(todo.id, {
        title: title.trim(),
        description: description.trim(),
      }),
    );
  }

  async function deleteTodo(id: number) {
    const confirmed = window.confirm(
      'Voulez-vous vraiment supprimer cette tâche ?',
    );

    if (!confirmed) {
      return;
    }

    await runAction(async () => {
      await request(`/todos/${id}`, {
        method: 'DELETE',
      });

      setTodos((current) =>
        current.filter((todo) => todo.id !== id),
      );

      setSelectedTodo((current) =>
        current?.id === id ? null : current,
      );
    });
  }

  async function showTodoDetails(id: number) {
    await runAction(async () => {
      const response = await request(`/todos/${id}`);
      const details: Todo = await response.json();
      setSelectedTodo(details);
    });
  }

  return (
    <main>
      <h1>Mes tâches</h1>

      <p>Connecté avec : {email}</p>

      <button type="button" onClick={() => onLogout()}>
        Se déconnecter
      </button>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p>Chargement des tâches...</p>
      ) : (
        <>
          <form onSubmit={createTodo}>
            <input
              type="text"
              aria-label="Titre de la nouvelle tâche"
              placeholder="Titre de la nouvelle tâche"
              value={newTitle}
              onChange={(event) =>
                setNewTitle(event.target.value)
              }
              maxLength={255}
              required
              disabled={busy}
            />

            <input
              type="text"
              aria-label="Description de la nouvelle tâche"
              placeholder="Description (facultative)"
              value={newDescription}
              onChange={(event) =>
                setNewDescription(event.target.value)
              }
              disabled={busy}
            />

            <button type="submit" disabled={busy}>
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
                <strong>Description :</strong>{' '}
                {selectedTodo.description?.trim() ||
                  'Aucune description'}
              </p>

              <p>
                <strong>État :</strong>{' '}
                {selectedTodo.completed
                  ? 'TERMINÉE'
                  : 'À FAIRE'}
              </p>

              {selectedTodo.createdAt && (
                <p>
                  <strong>Date de création :</strong>{' '}
                  {new Date(
                    selectedTodo.createdAt,
                  ).toLocaleString('fr-FR')}
                </p>
              )}

              <button
                type="button"
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
                      {todo.completed
                        ? 'TERMINÉE'
                        : 'À FAIRE'}
                    </strong>
                  </div>

                  <div className="todo-actions">
                    <button
                      type="button"
                      className="button-details"
                      disabled={busy}
                      onClick={() =>
                        showTodoDetails(todo.id)
                      }
                    >
                      Voir le détail
                    </button>

                    <button
                      type="button"
                      className="button-edit"
                      disabled={busy}
                      onClick={() => editTodo(todo)}
                    >
                      Modifier
                    </button>

                    <button
                      type="button"
                      className="button-toggle"
                      disabled={busy}
                      onClick={() =>
                        runAction(() =>
                          updateTodo(todo.id, {
                            completed: !todo.completed,
                          }),
                        )
                      }
                    >
                      {todo.completed
                        ? 'Remettre à faire'
                        : 'Terminer'}
                    </button>

                    <button
                      type="button"
                      className="button-delete"
                      disabled={busy}
                      onClick={() => deleteTodo(todo.id)}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

export default App;