import { StyleSheet, View } from 'react-native';
import { Text, Avatar, Button, Card } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>Profile</Text>
      </View>

      <View style={styles.content}>
        <Avatar.Icon size={100} icon="account" style={styles.avatar} />
        <Text variant="titleLarge" style={styles.name}>Guest User</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>Login to access your account</Text>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="bodyMedium" style={styles.cardText}>
              Sign in to manage your products, view trade offers, and connect with other users.
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button mode="contained" onPress={() => console.log('Login pressed')}>
              Login
            </Button>
            <Button mode="outlined" onPress={() => console.log('Register pressed')}>
              Register
            </Button>
          </Card.Actions>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontWeight: 'bold',
    color: '#2563EB',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avatar: {
    marginBottom: 16,
    backgroundColor: '#2563EB',
  },
  name: {
    marginBottom: 4,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#666',
    marginBottom: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
  },
  cardText: {
    textAlign: 'center',
    marginBottom: 8,
  },
});
