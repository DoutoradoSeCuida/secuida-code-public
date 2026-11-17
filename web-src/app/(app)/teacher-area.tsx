import { View } from 'react-native';
import Teacher from './(tabs)/teacher';
import { AppNavBar } from '../../src/components/AppNavBar';

export default function TeacherArea() {
  return <View style={{flex:1}}><View style={{flex:1}}><Teacher /></View><AppNavBar /></View>;
}
