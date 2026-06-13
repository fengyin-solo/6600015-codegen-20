defmodule SchedulerWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :scheduler

  plug Plug.Static, at: "/", from: :scheduler, gzip: false
  plug Plug.Parsers, parsers: [:json], pass: [], json_decoder: Jason
  plug SchedulerWeb.Router
end

defmodule SchedulerWeb.Router do
  use Phoenix.Router
  import Phoenix.Controller

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", SchedulerWeb do
    pipe_through :api
    get "/tasks", TaskController, :index
    post "/tasks", TaskController, :create
    post "/tasks/:id/retry", TaskController, :retry
    post "/tasks/:id/cancel", TaskController, :cancel
    get "/stats", TaskController, :stats
    get "/nodes", TaskController, :nodes

    get "/members", TaskController, :members
    post "/members/:id/toggle_leave", TaskController, :toggle_leave

    post "/handover", TaskController, :handover
    get "/handover_records", TaskController, :handover_records
  end
end

defmodule SchedulerWeb.TaskController do
  use Phoenix.Controller, formats: [:json]

  def index(conn, _params) do
    tasks = Scheduler.TaskManager.list_tasks()
    json(conn, %{tasks: Enum.map(tasks, &Map.from_struct/1)})
  end

  def create(conn, %{"name" => name}) do
    task = Scheduler.TaskManager.add_task(name)
    json(conn, %{task: Map.from_struct(task)})
  end

  def retry(conn, %{"id" => id}) do
    Scheduler.TaskManager.retry_task(id)
    json(conn, %{status: "ok"})
  end

  def cancel(conn, %{"id" => id}) do
    Scheduler.TaskManager.cancel_task(id)
    json(conn, %{status: "ok"})
  end

  def stats(conn, _params) do
    json(conn, Scheduler.TaskManager.get_stats())
  end

  def nodes(conn, _params) do
    nodes = for i <- 1..5 do
      %{
        id: "node-#{i}",
        name: if(i == 1, do: "scheduler-main", else: "worker-#{i - 1}"),
        type: if(i == 1, do: "scheduler", else: "worker"),
        status: if(:rand.uniform() > 0.1, do: "online", else: "overloaded"),
        cpu: 20 + :rand.uniform() * 60,
        memory: 30 + :rand.uniform() * 50,
        tasks: :rand.uniform(8),
        uptime: 3600 + :rand.uniform(86400)
      }
    end
    json(conn, %{nodes: nodes})
  end

  def members(conn, _params) do
    members = Scheduler.TaskManager.list_members()
    json(conn, %{members: Enum.map(members, &Map.from_struct/1)})
  end

  def toggle_leave(conn, %{"id" => id}) do
    Scheduler.TaskManager.toggle_member_leave(id)
    members = Scheduler.TaskManager.list_members()
    json(conn, %{status: "ok", members: Enum.map(members, &Map.from_struct/1)})
  end

  def handover(conn, params) do
    from_member_id = params["from_member_id"]
    to_member_id = params["to_member_id"]
    task_ids = params["task_ids"] || []
    alert_recipient_task_ids = params["alert_recipient_task_ids"] || []
    reason = params["reason"] || ""

    case Scheduler.TaskManager.handover_tasks(from_member_id, to_member_id, task_ids, alert_recipient_task_ids, reason) do
      {:ok, record} ->
        json(conn, %{status: "ok", record: record})

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{status: "error", reason: Atom.to_string(reason)})
    end
  end

  def handover_records(conn, _params) do
    records = Scheduler.TaskManager.get_handover_records()
    json(conn, %{handover_records: records})
  end
end

defmodule SchedulerWeb.ErrorJSON do
  def render(template, _assigns) do
    %{errors: %{detail: Phoenix.Controller.status_message_from_template(template)}}
  end
end
