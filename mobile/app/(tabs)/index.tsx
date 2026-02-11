import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  FlatList,
  View,
  Image,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Text, Card, Button, Searchbar, Chip, ActivityIndicator } from 'react-native-paper';
import { api, Product, formatPHP, getFirstImage } from '@/shared';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with padding

export default function HomeScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [error, setError] = useState<string | null>(null);

  const categories = ['All', 'Bag', 'School Supply', 'Book', 'Electronic', 'Clothing', 'Shoe'];

  // Fetch products from API
  const fetchProducts = async () => {
    try {
      console.log('🔄 Fetching products...');
      setLoading(true);
      setError(null);
      const response = await api.get('/api/products', {
        params: {
          status: 'available',
          limit: 20,
          keyword: searchQuery || undefined,
        },
        timeout: 15000,
      });
      setProducts(response.data?.data || []);
    } catch (error: any) {
      console.error('❌ API Error:', error.message);
      let errorMessage = 'Failed to load products';
      if (error.code === 'ECONNABORTED') errorMessage = 'Request timed out. Server may be sleeping.';
      else if (error.message?.includes('Network Error')) errorMessage = 'Network error. Check connection.';
      else errorMessage = error.response?.data?.message || error.message || errorMessage;
      setError(errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity style={styles.cardContainer}>
      <Card style={styles.card}>
        <Card.Cover
          source={{ uri: getFirstImage(item.image_urls) }}
          style={styles.cardImage}
        />
        <Card.Content style={styles.cardContent}>
          <Text variant="titleSmall" numberOfLines={2} style={styles.productTitle}>
            {item.title}
          </Text>
          <Text variant="bodySmall" numberOfLines={2} style={styles.productDescription}>
            {item.description}
          </Text>
          {item.price && !item.barter_only && (
            <Text variant="titleMedium" style={styles.price}>
              {formatPHP(item.price)}
            </Text>
          )}
          {item.barter_only && (
            <Chip icon="swap-horizontal" compact style={styles.barterChip}>
              Barter Only
            </Chip>
          )}
        </Card.Content>
        <Card.Actions>
          <Button mode="contained" compact>
            Trade
          </Button>
        </Card.Actions>
      </Card>
    </TouchableOpacity>
  );

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text variant="headlineSmall" style={styles.errorTitle}>⚠️ Error</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={fetchProducts} style={styles.retryButton}>
          Retry
        </Button>
      </View>
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.headerTitle}>
          Closevia
        </Text>
        <Searchbar
          placeholder="Search products..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <Chip
              selected={selectedCategory === item}
              onPress={() => {
                setSelectedCategory(item);
                setSearchQuery(item === 'All' ? '' : item);
              }}
              style={styles.categoryChip}
            >
              {item}
            </Chip>
          )}
          contentContainerStyle={styles.categoriesContainer}
        />
      </View>

      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.productList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyLarge">No products found</Text>
            <Text variant="bodySmall">Try adjusting your search</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF1',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFDF1',
  },
  loadingText: {
    marginTop: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFDF1',
  },
  headerTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#2D3748',
  },
  searchBar: {
    marginBottom: 12,
    elevation: 2,
  },
  categoriesContainer: {
    paddingVertical: 8,
  },
  categoryChip: {
    marginRight: 8,
  },
  productList: {
    padding: 16,
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  card: {
    elevation: 3,
  },
  cardImage: {
    height: CARD_WIDTH,
  },
  cardContent: {
    paddingVertical: 12,
    minHeight: 120,
  },
  productTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  productDescription: {
    color: '#666',
    marginBottom: 8,
  },
  price: {
    color: '#2563EB',
    fontWeight: 'bold',
    marginTop: 4,
  },
  barterChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  errorTitle: {
    marginBottom: 12,
    color: '#DC2626',
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 32,
    color: '#666',
  },
  retryButton: {
    marginTop: 8,
  },
});
