"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, X, AlertCircle } from "lucide-react";

export type NotificationType = {
  id: number;
  text: string;
  type?: "success" | "error" | "info";
};

interface NotificationProps extends NotificationType {
  removeNotif: (id: number) => void;
}

const NOTIFICATION_TTL = 4000;

function Notification({
  text,
  id,
  type = "success",
  removeNotif,
}: NotificationProps) {
  useEffect(() => {
    const timeoutRef = setTimeout(() => {
      removeNotif(id);
    }, NOTIFICATION_TTL);

    return () => clearTimeout(timeoutRef);
  }, [id, removeNotif]);

  const bgColor =
    type === "success"
      ? "bg-green-600"
      : type === "error"
      ? "bg-red-600"
      : "bg-blue-600";

  const Icon = type === "success" ? CheckCircle : AlertCircle;

  return (
    <motion.div
      layout
      initial={{ y: -15, scale: 0.95, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`p-3 flex items-start rounded-lg gap-2 text-sm font-medium shadow-lg text-white ${bgColor} pointer-events-auto`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="flex-1">{text}</span>
      <button
        onClick={() => removeNotif(id)}
        className="ml-auto mt-0.5 hover:opacity-70 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// Global notification state
let addNotificationCallback:
  | ((notification: Omit<NotificationType, "id">) => void)
  | null = null;

export function showNotification(
  text: string,
  type: "success" | "error" | "info" = "success"
) {
  if (addNotificationCallback) {
    addNotificationCallback({ text, type });
  }
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);

  useEffect(() => {
    addNotificationCallback = (notification) => {
      setNotifications((prev) => [
        { ...notification, id: Date.now() },
        ...prev,
      ]);
    };
    return () => {
      addNotificationCallback = null;
    };
  }, []);

  const removeNotif = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <>
      {children}
      <div className="flex flex-col gap-2 w-80 fixed top-4 right-4 z-100 pointer-events-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <Notification removeNotif={removeNotif} {...n} key={n.id} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

export default NotificationProvider;
