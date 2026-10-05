import express from "express";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(process.env.DB_FILE || path.join(__dirname, "daily-duo.sqlite"));

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Daily Duo',
  person1 TEXT NOT NULL DEFAULT 'Me',
  person2 TEXT NOT NULL DEFAULT 'Friend',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  room_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(room_id, task_id),
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);
CREATE TABLE IF NOT EXISTS checks (
  room_id TEXT NOT NULL,
  date TEXT NOT NULL,
  task_id TEXT NOT NULL,
  person INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(room_id, date, task_id, person),
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const today = () => new Date().toISOString().slice(0, 10);
const roomOk = id => typeof id === "string" && /^[a-f0-9]{10}$/.test(id);
const makeId = () => crypto.randomBytes(5).toString("hex");

app.post("/api/rooms", (req,res) => {
  const id = makeId();
  const name = String(req.body?.name || "Daily Duo").trim().slice(0,60) || "Daily Duo";
  const person1 = String(req.body?.person1 || "Me").trim().slice(0,30) || "Me";
  const person2 = String(req.body?.person2 || "Friend").trim().slice(0,30) || "Friend";
  db.prepare("INSERT INTO rooms(id,name,person1,person2,created_at) VALUES(?,?,?,?,?)")
    .run(id,name,person1,person2,new Date().toISOString());
  const defaults = ["Wake up on time","Exercise / walk","Study / work","Drink enough water","Eat healthy","Read for 10 minutes","Limit unnecessary scrolling","Sleep on time"];
  const insert = db.prepare("INSERT INTO tasks(room_id,task_id,text,position) VALUES(?,?,?,?)");
  const tx = db.transaction(() => defaults.forEach((t,i)=>insert.run(id,crypto.randomUUID(),t,i)));
  tx();
  res.json({id});
});

app.get("/api/rooms/:id", (req,res) => {
  const id=req.params.id;
  if(!roomOk(id)) return res.status(400).json({error:"Invalid room"});
  const room=db.prepare("SELECT id,name,person1,person2 FROM rooms WHERE id=?").get(id);
  if(!room) return res.status(404).json({error:"Room not found"});
  const tasks=db.prepare("SELECT task_id as id,text,position FROM tasks WHERE room_id=? AND active=1 ORDER BY position").all(id);
  res.json({room,tasks});
});

app.get("/api/rooms/:id/day/:date", (req,res) => {
  const {id,date}=req.params;
  if(!roomOk(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({error:"Invalid request"});
  const rows=db.prepare("SELECT task_id,person,done,updated_at FROM checks WHERE room_id=? AND date=?").all(id,date);
  res.json({date,checks:rows});
});

app.get("/api/rooms/:id/history", (req,res) => {
  const id=req.params.id;
  if(!roomOk(id)) return res.status(400).json({error:"Invalid room"});
  const rows=db.prepare(`
    SELECT date, person, SUM(done) AS done, COUNT(*) AS touched
    FROM checks WHERE room_id=? AND done=1
    GROUP BY date,person ORDER BY date DESC LIMIT 180
  `).all(id);
  res.json({history:rows});
});

app.post("/api/rooms/:id/check", (req,res) => {
  const {id}=req.params;
  const date=String(req.body?.date||"");
  const taskId=String(req.body?.taskId||"");
  const person=Number(req.body?.person);
  const done=req.body?.done ? 1 : 0;
  if(!roomOk(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !taskId || ![1,2].includes(person))
    return res.status(400).json({error:"Invalid request"});
  const task=db.prepare("SELECT 1 FROM tasks WHERE room_id=? AND task_id=? AND active=1").get(id,taskId);
  if(!task) return res.status(404).json({error:"Task not found"});
  db.prepare(`
    INSERT INTO checks(room_id,date,task_id,person,done,updated_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(room_id,date,task_id,person)
    DO UPDATE SET done=excluded.done, updated_at=excluded.updated_at
  `).run(id,date,taskId,person,done,new Date().toISOString());
  res.json({ok:true});
});

app.post("/api/rooms/:id/tasks", (req,res) => {
  const id=req.params.id, text=String(req.body?.text||"").trim().slice(0,120);
  if(!roomOk(id)||!text) return res.status(400).json({error:"Invalid task"});
  const max=db.prepare("SELECT COALESCE(MAX(position),-1) AS p FROM tasks WHERE room_id=?").get(id).p;
  const taskId=crypto.randomUUID();
  db.prepare("INSERT INTO tasks(room_id,task_id,text,position) VALUES(?,?,?,?)").run(id,taskId,text,max+1);
  res.json({id:taskId,text,position:max+1});
});

app.delete("/api/rooms/:id/tasks/:taskId", (req,res) => {
  const id=req.params.id, taskId=req.params.taskId;
  db.prepare("UPDATE tasks SET active=0 WHERE room_id=? AND task_id=?").run(id,taskId);
  res.json({ok:true});
});

app.patch("/api/rooms/:id", (req,res) => {
  const id=req.params.id;
  const name=String(req.body?.name||"").trim().slice(0,60);
  const person1=String(req.body?.person1||"").trim().slice(0,30);
  const person2=String(req.body?.person2||"").trim().slice(0,30);
  db.prepare("UPDATE rooms SET name=COALESCE(NULLIF(?,'') ,name), person1=COALESCE(NULLIF(?,'') ,person1), person2=COALESCE(NULLIF(?,'') ,person2) WHERE id=?")
    .run(name,person1,person2,id);
  res.json({ok:true});
});

app.get("/{*splat}", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

const port=process.env.PORT || 3000;
app.listen(port,()=>console.log(`Daily Duo running on http://localhost:${port}`));
