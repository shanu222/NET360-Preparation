
  # NET360 Preparation App

  This is a code bundle for NET360 Preparation App. The original project is available at https://www.figma.com/design/y9bYMsJLVtoN2SMwfEKBLc/NET360-Preparation-App.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  Run `npm run dev:server` in a second terminal to start the backend API.

  Optional env for frontend:
  - `VITE_API_BASE_URL=http://localhost:4000` (leave empty in local dev if Vite proxy is used)

  Optional env for backend:
  - `DB_PATH` to override where user data is stored.
  - `JWT_SECRET` to override the signing secret.

  ## MCQ Organization

  Place one or more CSV files inside `MCQS/` (or `public/MCQS/`).

  The API automatically:
  - Loads all CSV files recursively from these folders.
  - Organizes MCQs by subject (`mathematics`, `physics`, `english`, `biology`, `chemistry`).
  - Categorizes each subject into `Easy`, `Medium`, and `Hard`.
  - Uses explicit `difficulty` values from CSV/file names when provided; otherwise applies balanced automatic classification.

  Useful endpoints:
  - `GET /api/mcqs` for filtered questions (`subject`, `difficulty`, `topic`, `limit`).
  - `GET /api/mcqs/meta` for totals by subject and difficulty.

  ## Deploy to Render (Web Service)

  Use `render.yaml` to provision both services:

  - `net360-preparation` (frontend)
  - `net360-api` (backend)

  This setup keeps user profile/test data synced across devices because all clients read/write through the same API.

  If you rename the backend service, update `VITE_API_BASE_URL` accordingly.
  