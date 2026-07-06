import React, { useState, useEffect, useRef } from "react";
import { Modal, Text, ScrollArea, Code, ActionIcon, Group } from "@mantine/core";
import { IconX, IconTerminal } from "@tabler/icons-react";
import { fetchApi } from "../lib/api";

export default function ProcessLoggerModal({ opened, onClose, entityId, tasks, entityType }) {
  const [logs, setLogs] = useState("");
  const scrollRef = useRef(null);

  // Fetch initial logs
  useEffect(() => {
    if (opened && entityId) {
      fetchApi(`/logs/${entityId}`)
        .then((data) => {
          if (data && data.logs) {
            setLogs(data.logs);
          } else {
            setLogs("Waiting for logs...\n");
          }
        })
        .catch((err) => {
          console.error("Failed to fetch logs:", err);
          setLogs("Error loading logs.");
        });
    }
  }, [opened, entityId]);

  // Listen for websocket process_log events via tasks context
  useEffect(() => {
    const handleLogEvent = (event) => {
      const payload = event.detail;
      if (payload && payload.entity_id === entityId) {
        if (payload.type === "process_log") {
          setLogs((prev) => prev + payload.log + "\n");
        } else if (payload.type === "process_log_stream") {
          setLogs((prev) => prev + payload.log);
        }
      }
    };
    window.addEventListener("ws_message", handleLogEvent);
    return () => window.removeEventListener("ws_message", handleLogEvent);
  }, [entityId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [logs]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <IconTerminal size={20} />
          <Text weight={600}>Technical Info: Live Logs</Text>
        </Group>
      }
      size="xl"
      withCloseButton={false}
      styles={{
        header: { backgroundColor: "#1A1B1E", borderBottom: "1px solid #2C2E33", color: "white" },
        body: { backgroundColor: "#141517", padding: 0 },
      }}
    >
      <div style={{ position: "relative" }}>
        <ActionIcon
          onClick={onClose}
          style={{ position: "absolute", top: -45, right: 10, color: "white" }}
          variant="transparent"
        >
          <IconX size={20} />
        </ActionIcon>
        <ScrollArea h={500} viewportRef={scrollRef} p="md">
          <Code block color="dark" style={{ backgroundColor: "transparent", color: "#A6A7AB", fontSize: 12 }}>
            {logs || "No logs available yet."}
          </Code>
        </ScrollArea>
      </div>
    </Modal>
  );
}
