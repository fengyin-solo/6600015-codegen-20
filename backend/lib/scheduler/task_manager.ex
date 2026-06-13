defmodule Scheduler.TaskManager do
  use GenServer

  defmodule Task do
    defstruct [:id, :name, :status, :node, :created_at, :retries, :max_retries, :logs, :owner, :alert_recipients]
  end

  defmodule Member do
    defstruct [:id, :name, :department, :on_leave]
  end

  # Client API
  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def list_tasks, do: GenServer.call(__MODULE__, :list_tasks)

  def add_task(name) do
    GenServer.call(__MODULE__, {:add_task, name})
  end

  def retry_task(id), do: GenServer.call(__MODULE__, {:retry_task, id})

  def cancel_task(id), do: GenServer.call(__MODULE__, {:cancel_task, id})

  def get_stats, do: GenServer.call(__MODULE__, :get_stats)

  def list_members, do: GenServer.call(__MODULE__, :list_members)

  def toggle_member_leave(member_id) do
    GenServer.call(__MODULE__, {:toggle_member_leave, member_id})
  end

  def handover_tasks(from_member_id, to_member_id, task_ids, alert_recipient_task_ids, reason \\ "") do
    GenServer.call(__MODULE__, {:handover_tasks, from_member_id, to_member_id, task_ids, alert_recipient_task_ids, reason})
  end

  def get_handover_records, do: GenServer.call(__MODULE__, :get_handover_records)

  # Server callbacks
  @impl true
  def init(_) do
    members = [
      %Member{id: "m-1", name: "张三", department: "基础架构", on_leave: false},
      %Member{id: "m-2", name: "李四", department: "基础架构", on_leave: true},
      %Member{id: "m-3", name: "王五", department: "数据平台", on_leave: false},
      %Member{id: "m-4", name: "赵六", department: "数据平台", on_leave: false},
      %Member{id: "m-5", name: "孙七", department: "运维", on_leave: true},
      %Member{id: "m-6", name: "周八", department: "运维", on_leave: false}
    ]

    tasks = for i <- 1..8 do
      name = Enum.at(~w[data_sync email_batch report_gen cache_warm log_rotate db_backup index_rebuild health_check], rem(i - 1, 8))
      status = Enum.at(~w[pending running success failed]a, :rand.uniform(4) - 1)
      owner = Enum.at(members, :rand.uniform(length(members)) - 1)
      alert_recipients = members
        |> Enum.take_random(3)
        |> Enum.map(& &1.name)
      %Task{
        id: "task-#{1000 + i}",
        name: name,
        status: status,
        node: "worker-#{:rand.uniform(4)}",
        created_at: DateTime.utc_now(),
        retries: 0,
        max_retries: 3,
        logs: ["[INFO] Task #{name} created"],
        owner: owner.name,
        alert_recipients: alert_recipients
      }
    end
    {:ok, %{tasks: tasks, counter: 1009, members: members, handover_records: []}}
  end

  @impl true
  def handle_call(:list_tasks, _from, state) do
    {:reply, state.tasks, state}
  end

  @impl true
  def handle_call({:add_task, name}, _from, state) do
    counter = state.counter + 1
    owner = Enum.at(state.members, :rand.uniform(length(state.members)) - 1)
    alert_recipients = state.members
      |> Enum.take_random(3)
      |> Enum.map(& &1.name)
    task = %Task{
      id: "task-#{counter}",
      name: name,
      status: :pending,
      node: "worker-#{:rand.uniform(4)}",
      created_at: DateTime.utc_now(),
      retries: 0,
      max_retries: 3,
      logs: ["[INFO] Task #{name} queued"],
      owner: owner.name,
      alert_recipients: alert_recipients
    }
    {:reply, task, %{state | tasks: [task | state.tasks], counter: counter}}
  end

  @impl true
  def handle_call({:retry_task, id}, _from, state) do
    tasks = Enum.map(state.tasks, fn
      %{id: ^id} = t -> %{t | status: :pending, retries: t.retries + 1, logs: t.logs ++ ["[INFO] Retrying..."]}
      t -> t
    end)
    {:reply, :ok, %{state | tasks: tasks}}
  end

  @impl true
  def handle_call({:cancel_task, id}, _from, state) do
    tasks = Enum.map(state.tasks, fn
      %{id: ^id} = t -> %{t | status: :failed, logs: t.logs ++ ["[WARN] Cancelled"]}
      t -> t
    end)
    {:reply, :ok, %{state | tasks: tasks}}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = %{
      total: length(state.tasks),
      running: Enum.count(state.tasks, & &1.status == :running),
      success: Enum.count(state.tasks, & &1.status == :success),
      failed: Enum.count(state.tasks, & &1.status == :failed)
    }
    {:reply, stats, state}
  end

  @impl true
  def handle_call(:list_members, _from, state) do
    {:reply, state.members, state}
  end

  @impl true
  def handle_call({:toggle_member_leave, member_id}, _from, state) do
    members = Enum.map(state.members, fn
      %{id: ^member_id} = m -> %{m | on_leave: !m.on_leave}
      m -> m
    end)
    {:reply, :ok, %{state | members: members}}
  end

  @impl true
  def handle_call({:handover_tasks, from_member_id, to_member_id, task_ids, alert_recipient_task_ids, reason}, _from, state) do
    from_member = Enum.find(state.members, &(&1.id == from_member_id))
    to_member = Enum.find(state.members, &(&1.id == to_member_id))

    cond do
      is_nil(from_member) ->
        {:reply, {:error, :from_member_not_found}, state}

      is_nil(to_member) ->
        {:reply, {:error, :to_member_not_found}, state}

      from_member_id == to_member_id ->
        {:reply, {:error, :same_member}, state}

      true ->
        tasks = Enum.map(state.tasks, fn task ->
          task = if task.id in task_ids do
            %{task | owner: to_member.name, logs: task.logs ++ ["[INFO] Handover: #{from_member.name} -> #{to_member.name}"]}
          else
            task
          end

          task = if task.id in alert_recipient_task_ids and is_list(task.alert_recipients) do
            new_recipients = task.alert_recipients
              |> Enum.filter(&(&1 != from_member.name))
              |> Kernel.++([to_member.name])
              |> Enum.uniq()
            %{task | alert_recipients: new_recipients}
          else
            task
          end

          task
        end)

        record = %{
          id: "handover-#{System.system_time(:millisecond)}",
          from_member_id: from_member_id,
          from_member_name: from_member.name,
          to_member_id: to_member_id,
          to_member_name: to_member.name,
          task_ids: task_ids,
          alert_recipient_task_ids: alert_recipient_task_ids,
          reason: reason,
          created_at: DateTime.utc_now()
        }

        {:reply, {:ok, record}, %{state | tasks: tasks, handover_records: [record | state.handover_records]}}
    end
  end

  @impl true
  def handle_call(:get_handover_records, _from, state) do
    {:reply, state.handover_records, state}
  end
end
