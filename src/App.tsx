import { useCampusRadiusController } from "./hooks/useCampusRadius";
import { MainScreen, PermissionScreen, ProfileScreen } from "./components/CampusScreens";

export default function App() {
  const campus = useCampusRadiusController();

  if (campus.screen === "permission") {
    return (
      <PermissionScreen
        onContinue={campus.requestPermission}
        onDemo={campus.continueWithDemoLocation}
        permissionMessage={campus.permissionMessage}
      />
    );
  }

  if (campus.screen === "profile") {
    return (
      <ProfileScreen
        username={campus.username}
        bio={campus.bio}
        setUsername={campus.setUsername}
        setBio={campus.setBio}
        onSave={campus.saveProfile}
        error={campus.error}
      />
    );
  }

  return (
    <MainScreen
      username={campus.username}
      isVisible={campus.isVisible}
      setIsVisible={campus.setIsVisible}
      radius={campus.radius}
      setRadius={campus.setRadius}
      coords={campus.coords}
      nearbyUsers={campus.nearbyUsers}
      loading={campus.loading}
      refreshing={campus.refreshing}
      error={campus.error}
      viewMode={campus.viewMode}
      setViewMode={campus.setViewMode}
      chatOpen={campus.chatOpen}
      setChatOpen={campus.setChatOpen}
      chatMessages={campus.chatMessages}
      chatInput={campus.chatInput}
      setChatInput={campus.setChatInput}
      chatLoading={campus.chatLoading}
      onRefresh={() => campus.syncAndFetch(true)}
      onSendChat={campus.sendChat}
    />
  );
}
