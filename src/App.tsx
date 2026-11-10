import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import './App.css';

type Role = 'admin' | 'member' | 'viewer';

interface Todo {
  id: number;
  title: string;
  description?: string | null;
  completed: boolean;
  createdAt?: string;
}

interface Workspace {
  id: number;
  name: string;
  role: Role;
}

interface GroupMember {
  id: number;
  email: string;
  role: Role;
}

interface LoginResponse {
  access_token: string;
  user: { id: number; email: string };
}

type ApiRequest = (path: string, options?: RequestInit) => Promise<Response>;

const API_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

const roleLabels: Record<Role, string> = {
  admin: 'Administrateur',
  member: 'Membre',
  viewer: 'Lecture seule',
};

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
    // La déconnexion reste possible en mémoire.
  }
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Impossible de contacter le serveur.';
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();

    if (typeof data === 'object' && data !== null && 'message' in data) {
      if (typeof data.message === 'string') return data.message;

      if (Array.isArray(data.message)) {
        return data.message
          .filter((item): item is string => typeof item === 'string')
          .join(' ');
      }
    }
  } catch {
    // Certaines réponses ne contiennent pas de JSON.
  }

  return `La demande a échoué (${response.status}).`;
}

function jsonOptions(method: 'POST' | 'PATCH', body: object): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function App() {
  const [token, setToken] = useState(() => readStorage('access_token'));
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
    setError(expired ? 'Ta connexion a expiré. Reconnecte-toi.' : '');
    setMessage('');
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const action = registerMode ? 'register' : 'login';
      const response = await fetch(
        `${API_URL}/auth/${action}`,
        jsonOptions('POST', { email: email.trim(), password }),
      );

      if (!response.ok) throw new Error(await getErrorMessage(response));

      if (registerMode) {
        setRegisterMode(false);
        setPassword('');
        setMessage('Compte créé. Tu peux maintenant te connecter.');
        return;
      }

      const data: LoginResponse = await response.json();

      try {
        sessionStorage.setItem('access_token', data.access_token);
        sessionStorage.setItem('connected_email', data.user.email);
      } catch {
        clearStoredAuth();
        throw new Error('Le navigateur bloque le stockage de la connexion.');
      }

      setConnectedEmail(data.user.email);
      setPassword('');
      setToken(data.access_token);
    } catch (caughtError) {
      setError(errorText(caughtError));
    } finally {
      setSubmitting(false);
    }
  }

  if (token) {
    return <Dashboard token={token} email={connectedEmail} onLogout={logout} />;
  }

  return (
    <main className="login-page">
      <div className="login-container">
        <header className="login-heading">
          <div className="steps-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>Avancer<br /><span>pas à pas.</span></h1>
        </header>

        <section className="login-card">
          <h2>{registerMode ? 'Créer un compte' : 'Connexion'}</h2>

          {error && <p className="notice error" role="alert">{error}</p>}
          {message && <p className="notice success" role="status">{message}</p>}

          <form className="vertical-form" onSubmit={submitAuth}>
            <div className="field">
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
            </div>

            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input
                id="password"
                type="password"
                autoComplete={registerMode ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={registerMode ? 12 : 1}
                maxLength={128}
                required
                disabled={submitting}
              />
              {registerMode && <small>Au moins 12 caractères.</small>}
            </div>

            <button className="primary-button" disabled={submitting}>
              {submitting
                ? 'Un instant…'
                : registerMode ? 'Créer mon compte' : 'Se connecter'}
            </button>
          </form>

          <button
            className="text-button login-switch"
            type="button"
            disabled={submitting}
            onClick={() => {
              setRegisterMode((current) => !current);
              setPassword('');
              setError('');
              setMessage('');
            }}
          >
            {registerMode ? 'Déjà un compte ? Se connecter' : 'Créer un compte'}
          </button>
        </section>
      </div>
    </main>
  );
}

function Dashboard({
  token,
  email,
  onLogout,
}: {
  token: string;
  email: string;
  onLogout: (expired?: boolean) => void;
}) {
  const [page, setPage] = useState<'personal' | 'groups'>('personal');
  const [tab, setTab] = useState<'tasks' | 'users'>('tasks');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');

  const request = useCallback<ApiRequest>(async (path, options = {}) => {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (response.status === 401) {
      onLogout(true);
      throw new Error('Connexion expirée.');
    }

    if (!response.ok) throw new Error(await getErrorMessage(response));
    return response;
  }, [token, onLogout]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorkspaces() {
      try {
        const response = await request('/workspaces', {
          signal: controller.signal,
        });
        const data: Workspace[] = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('La liste des groupes est incorrecte.');
        }

        if (!controller.signal.aborted) setWorkspaces(data);
      } catch (caughtError) {
        if (!controller.signal.aborted) setError(errorText(caughtError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadWorkspaces();
    return () => controller.abort();
  }, [request]);

  const workspace = workspaces.find((item) => item.id === workspaceId);

  function openWorkspace(id: number) {
    setWorkspaceId(id);
    setTab('tasks');
    setShowCreate(false);
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (busy || !name) return;

    setBusy(true);
    setError('');

    try {
      const response = await request('/workspaces', jsonOptions('POST', { name }));
      const created: { id: number; name: string } = await response.json();

      setWorkspaces((current) => [...current, { ...created, role: 'admin' }]);
      setWorkspaceName('');
      openWorkspace(created.id);
    } catch (caughtError) {
      setError(errorText(caughtError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <nav aria-label="Navigation principale">
          <button
            type="button"
            className={page === 'personal' ? 'nav-link active' : 'nav-link'}
            aria-current={page === 'personal' ? 'page' : undefined}
            onClick={() => setPage('personal')}
          >
            Mes tâches personnelles
          </button>

          <button
            type="button"
            className={page === 'groups' ? 'nav-link active' : 'nav-link'}
            aria-current={page === 'groups' ? 'page' : undefined}
            onClick={() => {
              setPage('groups');
              setWorkspaceId(null);
              setTab('tasks');
            }}
          >
            Mes groupes de travail <span aria-hidden="true">›</span>
          </button>
        </nav>

        <div className="sidebar-account">
          <span className="account-email">{email}</span>
          <button type="button" className="text-button" onClick={() => onLogout()}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="app-content">
        <header className="page-header">
          <div>
            <h1>Espace de travail</h1>
            <p className="page-subtitle">
              {page === 'personal'
                ? 'Mes tâches personnelles'
                : workspace?.name ?? 'Mes groupes de travail'}
            </p>
          </div>

          {page === 'groups' && workspace && (
            <div className="group-picker">
              <label className="sr-only" htmlFor="group-picker">Choisir un groupe</label>
              <select
                id="group-picker"
                value={workspace.id}
                onChange={(event) => openWorkspace(Number(event.target.value))}
              >
                {workspaces.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
          )}
        </header>

        {page === 'personal' ? (
          <Tasks key="personal" request={request} />
        ) : (
          <>
            {error && <p className="notice error" role="alert">{error}</p>}

            {loading ? (
              <p className="empty-state" role="status">Chargement des groupes…</p>
            ) : workspace ? (
              <>
                <div className="group-toolbar">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setWorkspaceId(null)}
                  >
                    ← Tous mes groupes
                  </button>
                  <span className="role-badge">{roleLabels[workspace.role]}</span>
                </div>

                <nav className="group-tabs" aria-label="Pages du groupe">
                  <button
                    type="button"
                    className={tab === 'tasks' ? 'tab active' : 'tab'}
                    aria-current={tab === 'tasks' ? 'page' : undefined}
                    onClick={() => setTab('tasks')}
                  >
                    Tâches
                  </button>
                  <button
                    type="button"
                    className={tab === 'users' ? 'tab active' : 'tab'}
                    aria-current={tab === 'users' ? 'page' : undefined}
                    onClick={() => setTab('users')}
                  >
                    Utilisateurs
                  </button>
                </nav>

                {tab === 'tasks' ? (
                  <Tasks key={`tasks-${workspace.id}`} workspace={workspace} request={request} />
                ) : (
                  <Users
                    key={`users-${workspace.id}`}
                    workspace={workspace}
                    request={request}
                    connectedEmail={email}
                  />
                )}
              </>
            ) : (
              <>
                <div className="groups-heading">
                  <h2>Mes groupes</h2>
                  <button
                    type="button"
                    className="primary-button"
                    aria-expanded={showCreate}
                    disabled={busy}
                    onClick={() => setShowCreate((current) => !current)}
                  >
                    {showCreate ? 'Fermer' : 'Créer un groupe'}
                  </button>
                </div>

                {showCreate && (
                  <section className="panel">
                    <h2>Nouveau groupe</h2>
                    <form className="create-group-form" onSubmit={createWorkspace}>
                      <label className="sr-only" htmlFor="group-name">Nom du groupe</label>
                      <input
                        id="group-name"
                        placeholder="Ex. Notre projet"
                        value={workspaceName}
                        onChange={(event) => setWorkspaceName(event.target.value)}
                        maxLength={100}
                        required
                        disabled={busy}
                      />
                      <button className="primary-button" disabled={busy}>
                        {busy ? 'Création…' : 'Créer le groupe'}
                      </button>
                    </form>
                  </section>
                )}

                {workspaces.length === 0 ? (
                  !error && <div className="panel empty-state">Aucun groupe pour le moment.</div>
                ) : (
                  <ul className="group-list">
                    {workspaces.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="group-card"
                          disabled={busy}
                          onClick={() => openWorkspace(item.id)}
                        >
                          <span className="group-card-name">{item.name}</span>
                          <span className="group-card-role">{roleLabels[item.role]}</span>
                          <span className="group-arrow" aria-hidden="true">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

type TaskDialog =
  | { kind: 'new' }
  | { kind: 'edit' | 'delete' | 'details'; todo: Todo };

function AppDialog({
  title,
  busy = false,
  dismiss,
  children,
}: {
  title: string;
  busy?: boolean;
  dismiss: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) dismiss();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}

function Tasks({
  workspace,
  request,
}: {
  workspace?: Workspace;
  request: ApiRequest;
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dialog, setDialog] = useState<TaskDialog | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  const workspaceId = workspace?.id;
  const canWrite = !workspace || workspace.role === 'admin' || workspace.role === 'member';

  const path = useCallback(
    (id?: number) =>
      `/todos${id === undefined ? '' : `/${id}`}${
        workspaceId === undefined ? '' : `?workspaceId=${workspaceId}`
      }`,
    [workspaceId],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadTodos() {
      try {
        const response = await request(path(), { signal: controller.signal });
        const data: Todo[] = await response.json();

        if (!Array.isArray(data)) throw new Error('La liste reçue est incorrecte.');
        if (!controller.signal.aborted) setTodos(data);
      } catch (caughtError) {
        if (!controller.signal.aborted) setError(errorText(caughtError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadTodos();
    return () => controller.abort();
  }, [request, path]);

  function openDialog(next: TaskDialog) {
    setDialogError('');
    if (next.kind === 'new' || next.kind === 'edit') {
      setTitle(next.kind === 'edit' ? next.todo.title : '');
      setDescription(next.kind === 'edit' ? next.todo.description ?? '' : '');
    }
    setDialog(next);
  }

  async function runAction(action: () => Promise<void>, inDialog = false) {
    if (busy) return;
    setBusy(true);
    if (inDialog) setDialogError('');
    else setError('');

    try {
      await action();
    } catch (caughtError) {
      if (inDialog) setDialogError(errorText(caughtError));
      else setError(errorText(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || loading || !title.trim()) return;
    if (dialog?.kind !== 'new' && dialog?.kind !== 'edit') return;

    await runAction(async () => {
      const changes = { title: title.trim(), description: description.trim() };
      if (dialog.kind === 'edit') {
        await update(dialog.todo.id, changes);
      } else {
        const response = await request(path(), jsonOptions('POST', changes));
        const created: Todo = await response.json();
        setTodos((current) => [...current, created]);
        setFilter('all');
      }
      setDialog(null);
    }, true);
  }

  async function update(
    id: number,
    changes: { title?: string; description?: string; completed?: boolean },
  ) {
    if (!canWrite) return;

    const response = await request(path(id), jsonOptions('PATCH', changes));
    const updated: Todo = await response.json();

    setTodos((current) => current.map((todo) => todo.id === id ? updated : todo));
  }

  async function remove() {
    if (!canWrite || dialog?.kind !== 'delete') return;
    const id = dialog.todo.id;

    await runAction(async () => {
      await request(path(id), { method: 'DELETE' });
      setTodos((current) => current.filter((todo) => todo.id !== id));
      setDialog(null);
    }, true);
  }

  const visibleTodos = todos.filter((todo) =>
    filter === 'all' || (filter === 'done' ? todo.completed : !todo.completed),
  );

  return (
    <>
      {error && <p className="notice error" role="alert">{error}</p>}
      {!canWrite && <p className="notice">Accès en lecture seule.</p>}

      <section className="panel">
        <div className="section-heading tasks-header">
          <h2>{workspace ? 'Tâches du groupe' : 'Mes tâches personnelles'}</h2>
          {canWrite && (
            <button
              type="button"
              className="secondary-button new-task-button"
              disabled={busy || loading}
              onClick={() => openDialog({ kind: 'new' })}
            >
              <span aria-hidden="true">+</span> Nouvelle tâche
            </button>
          )}
        </div>

        <div className="filter-tabs" aria-label="Filtrer les tâches">
          {([
            ['all', 'Toutes'],
            ['pending', 'À faire'],
            ['done', 'Terminées'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'filter active' : 'filter'}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="empty-state" role="status">Chargement des tâches…</p>
        ) : visibleTodos.length === 0 ? (
          !error && (
            <p className="empty-state">
              {todos.length === 0
                ? 'Aucune tâche pour le moment.'
                : 'Aucune tâche dans cette catégorie.'}
            </p>
          )
        ) : (
          <ul className="todo-list">
            {visibleTodos.map((todo) => (
              <li className="todo-card" key={todo.id}>
                <div className="todo-heading">
                  <div className="todo-copy">
                    <h3>{todo.title}</h3>
                    {todo.description && (
                      <p className="todo-description">{todo.description}</p>
                    )}
                  </div>
                  <strong className={`todo-status ${todo.completed ? 'done' : ''}`}>
                    {todo.completed ? 'TERMINÉE' : 'À FAIRE'}
                  </strong>
                </div>

                <div className="todo-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction(async () => {
                      const response = await request(path(todo.id));
                      openDialog({ kind: 'details', todo: await response.json() as Todo });
                    })}
                  >
                    Voir le détail
                  </button>

                  {canWrite && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openDialog({ kind: 'edit', todo })}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="complete-button"
                        disabled={busy}
                        onClick={() => void runAction(() => update(todo.id, {
                          completed: !todo.completed,
                        }))}
                      >
                        {todo.completed ? 'Remettre à faire' : 'Terminer'}
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        disabled={busy}
                        onClick={() => openDialog({ kind: 'delete', todo })}
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(dialog?.kind === 'new' || dialog?.kind === 'edit') && (
        <AppDialog
          title={dialog.kind === 'new' ? 'Nouvelle tâche' : 'Modifier la tâche'}
          busy={busy}
          dismiss={() => setDialog(null)}
        >
          {dialogError && <p className="notice error" role="alert">{dialogError}</p>}
          <form className="dialog-form" onSubmit={saveTask}>
            <label htmlFor="task-title">Titre</label>
            <input
              id="task-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              readOnly={busy}
              required
            />
            <label htmlFor="task-description">Description (facultative)</label>
            <textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              readOnly={busy}
              rows={3}
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Annuler
              </button>
              <button type="submit" className="primary-button" disabled={busy || !title.trim()}>
                {dialog.kind === 'new' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </AppDialog>
      )}

      {dialog?.kind === 'delete' && (
        <AppDialog title="Supprimer la tâche ?" busy={busy} dismiss={() => setDialog(null)}>
          <p>« {dialog.todo.title} » sera supprimée définitivement.</p>
          {dialogError && <p className="notice error" role="alert">{dialogError}</p>}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              autoFocus
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={() => void remove()}
            >
              Supprimer
            </button>
          </div>
        </AppDialog>
      )}

      {dialog?.kind === 'details' && (
        <AppDialog title={dialog.todo.title} dismiss={() => setDialog(null)}>
          <div className="dialog-details">
            <p>{dialog.todo.description || 'Aucune description.'}</p>
            <p><strong>État : </strong>{dialog.todo.completed ? 'Terminée' : 'À faire'}</p>
            {dialog.todo.createdAt && (
              <p><strong>Créée le : </strong>{new Date(dialog.todo.createdAt).toLocaleString('fr-FR')}</p>
            )}
          </div>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setDialog(null)}>
              Fermer
            </button>
          </div>
        </AppDialog>
      )}
    </>
  );
}

function Users({
  workspace,
  request,
  connectedEmail,
}: {
  workspace: Workspace;
  request: ApiRequest;
  connectedEmail: string;
}) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const membersPath = `/workspaces/${workspace.id}/members`;
  const isAdmin = workspace.role === 'admin';
  const myEmail = connectedEmail.toLowerCase();

  useEffect(() => {
    const controller = new AbortController();

    async function loadMembers() {
      try {
        const response = await request(membersPath, {
          signal: controller.signal,
        });
        const data: GroupMember[] = await response.json();

        if (!Array.isArray(data)) throw new Error('La liste des membres est incorrecte.');
        if (!controller.signal.aborted) setMembers(data);
      } catch (caughtError) {
        if (!controller.signal.aborted) setListError(errorText(caughtError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadMembers();
    return () => controller.abort();
  }, [request, membersPath, refresh]);

  async function runMemberAction(action: () => Promise<void>) {
    if (!isAdmin || busy || loading) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await action();
    } catch (caughtError) {
      setError(errorText(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const memberEmail = email.trim().toLowerCase();
    if (!memberEmail) return;

    await runMemberAction(async () => {
      await request(membersPath, jsonOptions('POST', { email: memberEmail, role }));
      setEmail('');
      setMessage(`${memberEmail} a été ajouté au groupe.`);
      setListError('');
      setLoading(true);
      setRefresh((current) => current + 1);
    });
  }

  async function changeMemberRole(member: GroupMember, newRole: Role) {
    if (member.email.toLowerCase() === myEmail || member.role === newRole) return;

    await runMemberAction(async () => {
      const response = await request(
        `${membersPath}/${member.id}`,
        jsonOptions('PATCH', { role: newRole }),
      );
      const updated: { id: number; role: Role } = await response.json();

      setMembers((current) => current.map((item) =>
        item.id === updated.id ? { ...item, role: updated.role } : item,
      ));
      setMessage(`Le rôle de ${member.email} a été modifié.`);
    });
  }

  async function removeGroupMember(member: GroupMember) {
    if (!isAdmin || busy || loading || member.email.toLowerCase() === myEmail) return;
    if (!window.confirm(`Retirer ${member.email} de ce groupe ?`)) return;

    await runMemberAction(async () => {
      await request(`${membersPath}/${member.id}`, { method: 'DELETE' });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage(`${member.email} a été retiré du groupe.`);
    });
  }

  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <h2>Membres du groupe</h2>
        </div>

        {error && <p className="notice error" role="alert">{error}</p>}
        {message && <p className="notice success" role="status">{message}</p>}

        {loading ? (
          <p role="status">Chargement des membres…</p>
        ) : listError ? (
          <p className="notice error" role="alert">{listError}</p>
        ) : members.length === 0 ? (
          <p>Aucun membre à afficher.</p>
        ) : (
          <ul className="todo-list">
            {members.map((member) => {
              const canManage = isAdmin && member.email.toLowerCase() !== myEmail;

              return (
                <li className="todo-card" key={member.id}>
                  <div className="todo-heading" style={{ flexWrap: 'wrap' }}>
                    <p>{member.email}</p>

                    {canManage ? (
                      <select
                        aria-label={`Rôle de ${member.email}`}
                        style={{ width: 'auto' }}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) =>
                          void changeMemberRole(member, event.target.value as Role)
                        }
                      >
                        <option value="member">Membre</option>
                        <option value="viewer">Lecture seule</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    ) : (
                      <span className="role-badge">{roleLabels[member.role]}</span>
                    )}
                  </div>

                  {canManage && (
                    <div className="todo-actions">
                      <button
                        type="button"
                        className="delete-button"
                        aria-label={`Retirer ${member.email} du groupe`}
                        disabled={busy}
                        onClick={() => void removeGroupMember(member)}
                      >
                        Retirer du groupe
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="panel">
          <h2>Ajouter un utilisateur</h2>
          <p className="helper-text">La personne doit déjà avoir créé son compte.</p>

          <form className="task-form" onSubmit={addMember}>
            <div className="form-row">
              <label htmlFor="member-email">E-mail</label>
              <input
                id="member-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={busy}
              />
            </div>

            <div className="form-row">
              <label htmlFor="member-role">Rôle</label>
              <select
                id="member-role"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                disabled={busy}
              >
                <option value="member">Membre</option>
                <option value="viewer">Lecture seule</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>

            <div className="form-actions">
              <button className="primary-button" disabled={busy || loading}>
                Ajouter au groupe
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

export default App;