import sys

with open('logs/worker_stdout.log', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "Task: Explain" in line:
        print("".join(lines[i:i+30]))
        break
