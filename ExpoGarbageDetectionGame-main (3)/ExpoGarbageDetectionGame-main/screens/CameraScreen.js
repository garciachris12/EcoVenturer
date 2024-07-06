import React, { useState, useEffect } from 'react';
import { Alert, Animated, Modal, StyleSheet, Text, Button, Image, View, Platform, Dimensions, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { firebase } from './FirebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function CameraScreen({ route, navigation }) {
  const { object, trashes } = route.params;
  const { challengeNumber, trash, description } = object;
  const { name, level } = trash;
  const [isCorrect, setIsCorrect] = useState(null);
  const [image, setImage] = useState(null);
  const [apiResult, setApiResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [userDiary, setUserDiary] = useState([]);
  const [levelProgress, setLevelProgress] = useState([]);
  const [currentChallenge, setCurrentChallenge] = useState(0);
  const [currentName, setCurrentName] = useState(name);
  const [currentLevel, setCurrentLevel] = useState(level);
  const [hasUpdatedChallenge, setHasUpdatedChallenge] = useState(false);

  useEffect(() => {
    // Fetch the current challenge from local storage when the component is mounted
    AsyncStorage.getItem('currentChallenge').then(value => {
      if (value !== null) {
        setCurrentChallenge(Number(value));
      }
    });
  }, []);
  
  useEffect(() => {
    // Store the current challenge in local storage whenever it changes
    AsyncStorage.setItem('currentChallenge', currentChallenge.toString());
  }, [currentChallenge]);

  useEffect(() => {
    const fetchDiary = async () => {
      const user = firebase.auth().currentUser;
      if (user) {
        console.log('User is logged in:', user); // Log the current user
        const docRef = firebase.firestore().collection('users').doc(user.email);
        const doc = await docRef.get();
        if (doc.exists) {
          console.log('Document exists:', doc.data()); // Log the document data
          const diary = doc.data().diary || [];
          console.log('Fetched diary from Firebase:', diary); // Log the fetched diary
          setUserDiary(diary);
        } else {
          console.log('Document does not exist'); // Log if the document does not exist
        }
      } else {
        console.log('No user is logged in'); // Log if no user is logged in
      }
    };

    fetchDiary();
  }, []);

  const takePhotoLocal = async () => {
    try {
      console.log("Starting takePhotoLocal function");
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.3,
        base64: true,
      });
  
      console.log("ImagePicker result:", result);
  
      if (!result.cancelled && result.assets && result.assets[0]) {
        setIsAnalyzing(true);
        const { uri } = result.assets[0];
        const response = await fetch(uri);
        const blob = await response.blob();
  
        const imageName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".jpg";
        const ref = firebase.storage().ref().child(imageName);
        await ref.put(blob);
        const imageUrl = await ref.getDownloadURL();
  
        let formData = new FormData();
        formData.append('image_url', imageUrl);
        formData.append('candidate_labels', 'Plastic Bottles,Trash,Dirty Water,Car Exhaust,Unused Tires,Motorcycle Emission,Used Facemask,Straws and Utensils,Plastic Bags,Unused Appliances,Bird,Butterfly,Mango Tree,Indoor Plant,Outdoor Plant,Flower,Grass,Leaves,Cat,Dog,Plastic Bottles inside the Trashcan,Trashcan,AA Battery,Phone Charging Cables,Unused Cardboard Boxes,Reusable Bag,Aluminum Can,Tumbler,Newspaper,Food Container');
  
        console.log("Sending POST request to server");
  
        const image = `data:image/jpg;base64,${result.assets[0].base64}`;
        setImage(image);
  
        axios({
          method: "POST",
          url: "http://nashandrew.pythonanywhere.com/predict",
          data: formData,
          headers: {
            "Content-Type": "multipart/form-data"
          }
        })
        .then(async (response) => {
          console.log("API call was successful. Response data:", response.data);
          const labels = response.data.labels.replace(/[()]/g, '').split(', ').map(label => label.replace(/['"]/g, ''));
          console.log('Labels:', labels);
  
          const predictions = labels.map(label => label.toLowerCase());
          console.log('Predictions:', predictions);
  
          const isCorrect = predictions.includes(currentName.toLowerCase());
          setIsCorrect(isCorrect);
  
          const user = firebase.auth().currentUser;
          const docRef = firebase.firestore().collection('users').doc(user.email);
  
          const existingEntryIndex = userDiary.findIndex(entry => entry.correctAnswer === currentName);
          console.log('existingEntryIndex:', existingEntryIndex);
          console.log('currentName:', currentName);
          console.log('imageUrl:', imageUrl);
  
          if (existingEntryIndex !== -1) {
            Alert.alert(
              "Replace existing entry?",
              "An entry for this item already exists in your diary. Do you want to replace it with the new image?",
              [
                {
                  text: "Cancel",
                  onPress: () => {
                    console.log("Cancel Pressed");
                    setIsAnalyzing(false);
                  },
                  style: "cancel"
                },
                {
                  text: "OK",
                  onPress: async () => {
                    try {
                      const existingImageRef = firebase.storage().refFromURL(userDiary[existingEntryIndex].imageUrl);
                      await existingImageRef.delete();
                      await docRef.update({
                        diary: firebase.firestore.FieldValue.arrayRemove(userDiary[existingEntryIndex])
                      });
  
                      const newUserDiary = [...userDiary];
                      newUserDiary[existingEntryIndex] = { imageUrl, correctAnswer: currentName };
                      setUserDiary(newUserDiary);
                      await AsyncStorage.setItem('userDiary', JSON.stringify(newUserDiary));
                      await docRef.update({
                        diary: firebase.firestore.FieldValue.arrayUnion({ imageUrl, correctAnswer: currentName })
                      });
  
                      setIsAnalyzing(false);
                    } catch (error) {
                      console.error("Error during image replacement:", error);
                      setIsAnalyzing(false);
                    }
                  }
                }
              ],
              { cancelable: false }
            );
          } else {
            const newUserDiary = [...userDiary, { imageUrl, correctAnswer: currentName }];
            setUserDiary(newUserDiary);
            await AsyncStorage.setItem('userDiary', JSON.stringify(newUserDiary));
            await docRef.update({
              diary: firebase.firestore.FieldValue.arrayUnion({ imageUrl, correctAnswer: currentName })
            });
            setIsAnalyzing(false);
          }
  
          if (!isCorrect) {
            await ref.delete();
            console.log("Image deleted from Firebase Storage");
          }
  
        })
        .catch((error) => {
          console.error("Error occurred during the API call:", error.message);
          setIsAnalyzing(false);
        });
      } else {
        console.log("Image selection was cancelled or there was an error");
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error(error.message);
      setIsAnalyzing(false);
    }
  };

  const pickImageLocal = async () => {
    try {
      console.log("Starting pickImageLocal function");
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      });
  
      console.log("ImagePicker result:", result);
  
      if (!result.cancelled && result.assets && result.assets[0]) {
        setIsAnalyzing(true);
        const { uri } = result.assets[0];
        const response = await fetch(uri);
        const blob = await response.blob();
  
        const imageName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".jpg";
        const ref = firebase.storage().ref().child(imageName);
        await ref.put(blob);
        const imageUrl = await ref.getDownloadURL();
  
        let formData = new FormData();
        formData.append('image_url', imageUrl);
        formData.append('candidate_labels', 'Plastic Bottles,Trash,Dirty Water,Car Exhaust,Unused Tires,Motorcycle Emission,Used Facemask,Straws and Utensils,Plastic Bags,Unused Appliances,Bird,Butterfly,Mango Tree,Indoor Plant,Outdoor Plant,Flower,Grass,Leaves,Cat,Dog,Plastic Bottles inside the Trashcan,Trashcan,AA Battery,Phone Charging Cables,Unused Cardboard Boxes,Reusable Bag,Aluminum Can,Tumbler,Newspaper,Food Container');
  
        console.log("Sending POST request to server");
  
        const image = `data:image/jpg;base64,${result.assets[0].base64}`;
        setImage(image);
  
        axios({
          method: "POST",
          url: "http://nashandrew.pythonanywhere.com/predict",
          data: formData,
          headers: {
            "Content-Type": "multipart/form-data"
          }
        })
        .then(async (response) => {
          console.log("API call was successful. Response data:", response.data);
          const labels = response.data.labels.replace(/[()]/g, '').split(', ').map(label => label.replace(/['"]/g, ''));
          console.log('Labels:', labels);
  
          const predictions = labels.map(label => label.toLowerCase());
          console.log('Predictions:', predictions);
  
          const isCorrect = predictions.includes(currentName.toLowerCase());
          setIsCorrect(isCorrect);
  
          const user = firebase.auth().currentUser;
          const docRef = firebase.firestore().collection('users').doc(user.email);
  
          const existingEntryIndex = userDiary.findIndex(entry => entry.correctAnswer === currentName);
          console.log('existingEntryIndex:', existingEntryIndex);
          console.log('currentName:', currentName);
          console.log('imageUrl:', imageUrl);
  
          if (existingEntryIndex !== -1) {
            Alert.alert(
              "Replace existing entry?",
              "An entry for this item already exists in your diary. Do you want to replace it with the new image?",
              [
                {
                  text: "Cancel",
                  onPress: () => {
                    console.log("Cancel Pressed");
                    setIsAnalyzing(false);
                  },
                  style: "cancel"
                },
                {
                  text: "OK",
                  onPress: async () => {
                    try {
                      const existingImageRef = firebase.storage().refFromURL(userDiary[existingEntryIndex].imageUrl);
                      await existingImageRef.delete();
                      await docRef.update({
                        diary: firebase.firestore.FieldValue.arrayRemove(userDiary[existingEntryIndex])
                      });
  
                      const newUserDiary = [...userDiary];
                      newUserDiary[existingEntryIndex] = { imageUrl, correctAnswer: currentName };
                      setUserDiary(newUserDiary);
                      await AsyncStorage.setItem('userDiary', JSON.stringify(newUserDiary));
                      await docRef.update({
                        diary: firebase.firestore.FieldValue.arrayUnion({ imageUrl, correctAnswer: currentName })
                      });
  
                      setIsAnalyzing(false);
                    } catch (error) {
                      console.error("Error during image replacement:", error);
                      setIsAnalyzing(false);
                    }
                  }
                }
              ],
              { cancelable: false }
            );
          } else {
            const newUserDiary = [...userDiary, { imageUrl, correctAnswer: currentName }];
            setUserDiary(newUserDiary);
            await AsyncStorage.setItem('userDiary', JSON.stringify(newUserDiary));
            await docRef.update({
              diary: firebase.firestore.FieldValue.arrayUnion({ imageUrl, correctAnswer: currentName })
            });
            setIsAnalyzing(false);
          }
  
          if (!isCorrect) {
            await ref.delete();
            console.log("Image deleted from Firebase Storage");
          }
  
        })
        .catch((error) => {
          console.error("Error occurred during the API call:", error.message);
          setIsAnalyzing(false);
        });
      } else {
        console.log("Image selection was cancelled or there was an error");
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error(error.message);
      setIsAnalyzing(false);
    }
  };
  
  /*
  const takePhotoLocal = async () => {
    console.log("Starting takePhotoLocal function");
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.3,
      base64: true,
    });

    console.log("ImagePicker result:", result);

    if (!result.cancelled) {
      if (!result.assets[0]) {
        console.log("No image was captured");
        setIsAnalyzing(false);
        return;
      }
    
      setIsAnalyzing(true);
      const { uri } = result.assets[0];
      const response = await fetch(uri);
      const blob = await response.blob();

      const imageName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".jpg";

      const ref = firebase.storage().ref().child(imageName);
      await ref.put(blob);

      const imageUrl = await ref.getDownloadURL();

      let formData = new FormData();
      formData.append('image_url', imageUrl);
      formData.append('candidate_labels', 'Plastic Bottles,Trash,Dirty Water,Car Exhaust,Unused Tires,Motorcycle Emission,Used Facemask,Straws and Utensils,Plastic Bags,Unused Appliances,Bird,Butterfly,Mango Tree,Indoor Plant,Outdoor Plant,Flower,Grass,Leaves,Cat,Dog,Plastic Bottles inside the Trashcan,Trashcan,AA Battery,Phone Charging Cables,Unused Cardboard Boxes,Reusable Bag,Aluminum Can,Tumbler,Newspaper,Food Container');
      console.log("Sending POST request to server");

      const image = `data:image/jpg;base64,${result.assets[0].base64}`;
      setImage(image); 

      const predictions = [];

      return axios({
        method: "POST",
        url: "http://nashandrew.pythonanywhere.com/predict",
        data: formData,
        headers: {
          "Content-Type": "multipart/form-data"
        }
      })
      .then(function(response) {
        const user = firebase.auth().currentUser;
        console.log("API call was successful. Response data:", response.data);
        const docRef = firebase.firestore().collection('users').doc(user.email);

        const existingEntryIndex = userDiary.findIndex(entry => entry.correctAnswer === currentName);
        console.log('existingEntryIndex:', existingEntryIndex); // Check if existingEntryIndex is calculated correctly
      
        console.log('currentName:', currentName); // Check if currentName has the expected value
        console.log('imageUrl:', imageUrl); // Check if imageUrl has the expected value
      
        let newUserDiary = [...userDiary];

        if (existingEntryIndex !== -1 && predictions.map(p => p.toLowerCase()).includes(currentName.toLowerCase())) {
          Alert.alert(
            "Replace existing entry?",
            "An entry for this item already exists in your diary. Do you want to replace it with the new image?",
            [
              {
                text: "Cancel",
                onPress: () => console.log("Cancel Pressed"),
                style: "cancel"
              },
              {   
              text: "OK",
              onPress: () => {
                // Get the reference to the existing image
                const existingImageRef = firebase.storage().refFromURL(userDiary[existingEntryIndex].imageUrl);

                // Delete the existing image
                existingImageRef.delete().then(() => {
                  console.log("Existing image deleted from Firebase Storage");

                  // Update the Firestore document
                  docRef.update({
                    diary: firebase.firestore.FieldValue.arrayRemove(userDiary[existingEntryIndex])
                  }).then(() => {
                    const newUserDiary = [...userDiary];
                    newUserDiary[existingEntryIndex] = { imageUrl, correctAnswer: currentName };
                  });
                }).catch((error) => {
                  console.error("Error deleting existing image from Firebase Storage:", error);
                });
              }
            }
            ],
            { cancelable: false }
          );
        } else {
          const newUserDiary = [...userDiary, { imageUrl, correctAnswer: currentName }];

        }
      
        if (response.data.labels) {
          const labels = response.data.labels.replace(/[()]/g, '').split(', ').map(label => label.replace(/['"]/g, ''));
          console.log('Labels:', labels); 

          if (labels.length > 0) {
            predictions.push(labels[0].toLowerCase());
          }

          console.log('Predictions:', predictions); 

        if (predictions.map(p => p.toLowerCase()).includes(currentName.toLowerCase())) {
          setIsCorrect(true);

          setUserDiary(newUserDiary);
          AsyncStorage.setItem('userDiary', JSON.stringify(newUserDiary));
          docRef.update({
            diary: firebase.firestore.FieldValue.arrayUnion({ imageUrl, correctAnswer: currentName })
          });
        } else {
          setIsCorrect(false);
          ref.delete().then(() => {
            console.log("Image deleted from Firebase Storage");

            ref.getDownloadURL().then(() => {
              console.log("Error: Image still exists");
            }).catch(() => {
              console.log("Image successfully deleted");
            });

          }).catch((error) => {
            console.error("Error deleting image from Firebase Storage:", error);
          });
        }

          setIsAnalyzing(false);
        } else {
          console.log('Error: labels is undefined');
          setIsAnalyzing(false);
        }

        return response.data;
      })
      .catch(function(error) {
        console.error("Error occurred during the API call:", error.message);
        setIsAnalyzing(false);
        throw error;
      });
      
    } else {
      console.log("Image selection was cancelled or there was an error");
      setIsAnalyzing(false);
    }
  };


  const pickImageLocal = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.3,
      base64: true,
    });

    console.log("ImagePicker result:", result);

    if (!result.cancelled) {
      if (!result.assets[0]) {
        console.log("No image was selected");
        setIsAnalyzing(false);
        return;
      }

      setIsAnalyzing(true);
      const { uri } = result.assets[0];
      const response = await fetch(uri);
      const blob = await response.blob();

      const imageName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".jpg";

      const ref = firebase.storage().ref().child(imageName);
      await ref.put(blob);

      const imageUrl = await ref.getDownloadURL();

      let formData = new FormData();
      formData.append('image_url', imageUrl);
      formData.append('candidate_labels', 'Plastic Bottles,Trash,Dirty Water,Car Exhaust,Unused Tires,Motorcycle Emission,Used Facemask,Straws and Utensils,Plastic Bags,Unused Appliances,Bird,Butterfly,Mango Tree,Indoor Plant,Outdoor Plant,Flower,Grass,Leaves,Cat,Dog,Plastic Bottles inside the Trashcan,Trashcan,AA Battery,Phone Charging Cables,Unused Cardboard Boxes,Reusable Bag,Aluminum Can,Tumbler,Newspaper,Food Container');
      console.log("Sending POST request to server");

      const image = `data:image/jpg;base64,${result.assets[0].base64}`;
      setImage(image); 

      const predictions = [];

      return axios({
        method: "POST",
        url: "http://nashandrew.pythonanywhere.com/predict",
        data: formData,
        headers: {
          "Content-Type": "multipart/form-data"
        }
      })
      .then(function(response) {
        console.log("API call was successful. Response data:", response.data);
        const user = firebase.auth().currentUser;
        const docRef = firebase.firestore().collection('users').doc(user.email);

        const existingEntryIndex = userDiary.findIndex(entry => entry.correctAnswer === currentName);
        console.log('existingEntryIndex:', existingEntryIndex); // Check if existingEntryIndex is calculated correctly
      
        console.log('currentName:', currentName); // Check if currentName has the expected value
        console.log('imageUrl:', imageUrl); // Check if imageUrl has the expected value
        let newUserDiary = [...userDiary];

        if (existingEntryIndex !== -1 && predictions.map(p => p.toLowerCase()).includes(currentName.toLowerCase())) {
          Alert.alert(
            "Replace existing entry?",
            "An entry for this item already exists in your diary. Do you want to replace it with the new image?",
            [
              {
                text: "Cancel",
                onPress: () => console.log("Cancel Pressed"),
                style: "cancel"
              },
              {
                text: "OK",
                onPress: () => {
                  // Get the reference to the existing image
                  const existingImageRef = firebase.storage().refFromURL(userDiary[existingEntryIndex].imageUrl);

                  // Delete the existing image
                  existingImageRef.delete().then(() => {
                    console.log("Existing image deleted from Firebase Storage");

                    // Update the Firestore document
                    docRef.update({
                      diary: firebase.firestore.FieldValue.arrayRemove(userDiary[existingEntryIndex])
                    }).then(() => {
                      const newUserDiary = [...userDiary];
                      newUserDiary[existingEntryIndex] = { imageUrl, correctAnswer: currentName };
                    });
                  }).catch((error) => {
                    console.error("Error deleting existing image from Firebase Storage:", error);
                  });
                }
              }
            ],
            { cancelable: false }
          );
        } else {
          newUserDiary.push({ imageUrl, correctAnswer: currentName });
        }

      
        if (response.data.labels) {
          const labels = response.data.labels.replace(/[()]/g, '').split(', ').map(label => label.replace(/['"]/g, ''));
          console.log('Labels:', labels); 

          if (labels.length > 0) {
            predictions.push(labels[0].toLowerCase());
          }

          console.log('Predictions:', predictions); 

        if (predictions.map(p => p.toLowerCase()).includes(currentName.toLowerCase())) {
          setIsCorrect(true);

          setUserDiary(newUserDiary);
          AsyncStorage.setItem('userDiary', JSON.stringify(newUserDiary));
          docRef.update({
            diary: firebase.firestore.FieldValue.arrayUnion({ imageUrl, correctAnswer: currentName })
          });
        } else {
          setIsCorrect(false);
          ref.delete().then(() => {
            console.log("Image deleted from Firebase Storage");

            ref.getDownloadURL().then(() => {
              console.log("Error: Image still exists");
            }).catch(() => {
              console.log("Image successfully deleted");
            });

          }).catch((error) => {
            console.error("Error deleting image from Firebase Storage:", error);
          });
        }

          setIsAnalyzing(false);
        } else {
          console.log('Error: labels is undefined');
          setIsAnalyzing(false);
        }

        return response.data;
      })
      .catch(function(error) {
        console.error("Error occurred during the API call:", error.message);
        setIsAnalyzing(false);
        throw error;
      });
      
    } else {
      console.log("Image selection was cancelled or there was an error");
      setIsAnalyzing(false);
    }
  };

  */

  useEffect(() => {
    console.log('isCorrect:', isCorrect);
    console.log('challengeNumber:', challengeNumber);
    console.log('currentChallenge:', currentChallenge);
    if (isCorrect === true) {
      const user = firebase.auth().currentUser;
      if (user) {
        const userRef = firebase.firestore().collection('users').doc(user.email);
        userRef.get().then((doc) => {
          if (doc.exists) {
            const userData = doc.data();
            let levelProgress = Array.isArray(userData.levelProgress) ? userData.levelProgress : [0, 0, 0];
  
            levelProgress[0]++;
            setLevelProgress([...levelProgress]);
            let newChallenge = currentChallenge + 1;
            let updateObject = {
              levelProgress: levelProgress,
              currentChallenge: newChallenge
            };
  
            userRef.update(updateObject);
            setCurrentChallenge(newChallenge);
            
            userRef.update(updateObject);
            setHasUpdatedChallenge(true);
          } 
        }).catch((error) => {
          console.log("Error getting document:", error);
        });
      }
    }
  }, [isCorrect]); 

  useEffect(() => {
    if (isCorrect === false) {
      setHasUpdatedChallenge(false);
    }
  }, [isCorrect]);

  const fadeInOut = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 2000,
        useNativeDriver: true,
      }),
    ]).start(() => fadeInOut());
  };

  useEffect(() => {
    fadeInOut();
  }, []);
  
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          alert('Sorry, we need camera roll permissions to make this work!');
        }
      }
    })();
  }, []);
  
  const handleNextChallenge = async () => {
    let nextChallenge = currentChallenge - 1;
  
    if (nextChallenge < trashes.length) {
      setCurrentLevel(trashes[nextChallenge].level);
      setCurrentName(trashes[nextChallenge].name);
      
      setIsCorrect(null);
      setImage(null);
      setCurrentChallenge(nextChallenge);
    } else {
      navigation.navigate('Land Pollution');
    }
  };

  const handleMinigame = async () => {
    navigation.navigate('Minigame');
  };

  useEffect(() => {
    console.log(currentLevel);
    console.log(currentName);
  }, [currentLevel, currentName]);

  return (
    <View style={styles.container}>
      <Modal
        animationType="slide"
        transparent={true}
        visible={isAnalyzing}
        onRequestClose={() => {
          setIsAnalyzing(false);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Animated.Text style={{...styles.modalText, opacity: fadeAnim}}>
              Analyzing image using OpenAI...
            </Animated.Text>
          </View>
        </View>
      </Modal>
  
      <View style={styles.header}>
        <Image
          source={require('../assets/header.png')}
          style={styles.image}
        />
        <View style={styles.backButtonContainer}>
          <TouchableOpacity onPress={() => navigation.navigate('Land Pollution')}>
            <Image
              source={require('../assets/round-back.png')}
              style={styles.backButtonImage}
            />
          </TouchableOpacity>
          <Text style={styles.headerText}>Return</Text>
        </View>
      </View>

      <Text style={styles.labelText}>Challenge #{currentLevel ? currentLevel.toString() : 'N/A'}</Text>

      {image ? (
        <Image key={image} source={image ? { uri: image } : null} style={styles.playButton} />
      ) : (
        <TouchableOpacity style={styles.playButton} onPress={() => null }>
          <Text style={styles.playButtonText1}>Take a photo of:</Text>
          <Text style={styles.playButtonText2}>{currentName}</Text>
        </TouchableOpacity>
      )}

      {isCorrect !== null && (
        <Text style={[styles.judgeText, { color: isCorrect ? 'orange' : 'red' }]}>
          {isCorrect ? 'Congratulations! This is the right image.' : 'Oops. This seems to be the wrong item.'}
        </Text>
      )}

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: width * 0.01, }}>
          {isCorrect === null ? (
            <>
              <TouchableOpacity style={styles.button1} onPress={takePhotoLocal}>
                <Text style={styles.buttonText}>Take a Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.button2} onPress={pickImageLocal}>
                <Text style={styles.buttonText}>Upload a Photo</Text>
              </TouchableOpacity>
            </>
          ) : isCorrect ? (
            <>
              <TouchableOpacity style={[styles.button1, { height: '70%', } ]} onPress= { null }>
                <Text style={styles.descriptionText}>{route.params.object.description}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[ styles.button2, { height: '15%', } ]} 
                onPress={handleMinigame}
              >
                <Text style={styles.buttonText}>NEXT MINIGAME</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={[ styles.button1, { marginTop: height * 0.21, height: '25%'} ]} onPress={() => {
              setIsCorrect(null); 
            }}>
              <Text style={styles.buttonText}>Retake another picture</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
  },
  modalView: {
    margin: 20,
    backgroundColor: "#4fb2aa",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
    modalText: {
      textAlign: "center",
      color: "white", 
      fontSize: 18, 
      fontWeight: "bold", 
    },
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  backButtonImage: {
    width: 50,
    height: 50,
  },
  playButtonText1: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: width * 0.035,
    paddingLeft: 10,
  },
  playButtonText2: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: width * 0.075,
    alignSelf: 'center',
    marginTop: width * 0.125,
  },
  header: {
    height: '23%',
    width: '100%',
  },
  labelText: {
    color: '#3b5a9d',
    fontSize: width * 0.07,
    fontWeight: 'bold',
    marginLeft: width * 0.1,
    marginBottom: 20,
  },
  judgeText: {
    textAlign: 'center',
    fontSize: width * 0.035,
    fontWeight: 'bold',
    marginTop: 20,
  },
  playButton: {
    backgroundColor: '#4fb2aa',
    width: '75%',
    height: '25%',
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    padding: 10,
    alignItems: 'flex-start', 
    marginTop: height * 0.005,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  image: {
    width: '100%',
    height: '80%',
    resizeMode: 'cover',
  },
  backButtonContainer: {
    position: 'absolute',
    top: height * 0.09,
    left: width * 0.075,
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallButton: {
    backgroundColor: '#4fb2aa',
    width: '55%',
    height: '8%',
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    padding: 10,
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.02,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  smallButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: width * 0.05,
  },
  headerText: {
    marginLeft: 10,
    fontSize: width * 0.075,
    color: 'white',
    fontWeight: 'bold'
  },
  button1: {
    backgroundColor: '#3b5a9d',
    justifyContent: 'center',
    borderRadius: 20,
    padding: 10,
    margin: 10,
    elevation: 5,
    width: '80%',
    height: '20%',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  button2: {
    backgroundColor: '#ffa633',
    justifyContent: 'center',
    borderRadius: 20,
    padding: 10,
    margin: 10,
    elevation: 5,
    height: '20%',
    width: '80%',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonText: {
    color: '#fff',
    fontSize: width * 0.05,
    fontWeight: 'bold',
  },
  descriptionText: {
    color: '#fff',
    fontSize: width * 0.03,
    fontWeight: 'bold',
  },
});