// src/App.js
import React, { useState } from 'react';
import { request, RpcErrorCode, AddressPurpose } from '@sats-connect/core';
import * as bitcoin from 'bitcoinjs-lib';

function App() {
    // Состояния для Xverse Wallet
    const [xverseConnected, setXverseConnected] = useState(false);
    const [xverseAddresses, setXverseAddresses] = useState([]);

    // Состояния для UniSat Wallet
    const [uniSatConnected, setUniSatConnected] = useState(false);
    const [uniSatAddress, setUniSatAddress] = useState('');
    const [uniSatPublicKey, setUniSatPublicKey] = useState('');

    // Общие состояния
    const [lpId, setLpId] = useState('');
    const [status, setStatus] = useState('');

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000';

    // Функция подключения Xverse кошелька
    const connectXverse = async () => {
        try {
            const params = {
                purposes: ['payment', 'ordinals'],
                message: 'Пожалуйста, подключите свой кошелек для подписания PSBT.'
            };

            const response = await request('getAccounts', params);
            console.log("Xverse getAccounts response:", response);

            if (response.status === 'success') {
                setXverseAddresses(response.result);
                setXverseConnected(true);
                setStatus('Xverse кошелек подключен.');
            } else {
                if (response.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил запрос на подключение Xverse кошелька.");
                } else {
                    alert("Ошибка подключения Xverse кошелька: " + response.error.message);
                }
            }
        } catch (err) {
            console.error(err);
            alert("Ошибка подключения Xverse кошелька: " + err.message);
        }
    };

    // Функция подключения UniSat Wallet
    const connectUniSat = async () => {
        try {
            if (typeof window.unisat === 'undefined') {
                alert('UniSat Wallet не обнаружен. Пожалуйста, установите расширение UniSat.');
                return;
            }

            setStatus('Подключение к UniSat Wallet...');
            const accounts = await window.unisat.requestAccounts();
            if (accounts && accounts.length > 0) {
                setUniSatAddress(accounts[0]);
                setUniSatConnected(true);
                setStatus(`UniSat Wallet подключен: ${accounts[0]}`);

                // Получение публичного ключа пользователя
                try {
                    if (typeof window.unisat.getPublicKey === 'function') {
                        const publicKey = await window.unisat.getPublicKey();
                        setUniSatPublicKey(publicKey);
                        console.log('UniSat User Public Key:', publicKey);
                    } else {
                        // Если метод отсутствует, используем заглушку или запросите у пользователя
                        setUniSatPublicKey('placeholder_public_key');
                        console.warn('Метод getPublicKey не найден. Используется заглушка.');
                    }
                } catch (pkError) {
                    console.error('Ошибка получения публичного ключа UniSat:', pkError);
                    setStatus(`Ошибка получения публичного ключа UniSat: ${pkError.message}`);
                }
            } else {
                setStatus('Не удалось получить адрес кошелька UniSat.');
            }
        } catch (error) {
            console.error('Ошибка подключения UniSat Wallet:', error);
            setStatus(`Ошибка подключения UniSat Wallet: ${error.message}`);
        }
    };

    // Функция обработки изменения ID launchpad
    const handleLpIdChange = (e) => {
        setLpId(e.target.value);
    };

    // Функция конвертации Hex в Base64
    const hexToBase64 = (hex) => {
        if (hex.length % 2 !== 0) {
            throw new Error('Hex string must have an even number of characters');
        }

        const bytes = hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
        let binary = '';
        bytes.forEach(byte => binary += String.fromCharCode(byte));
        return btoa(binary);
    };

    // =====================================
    // Функции для Xverse Wallet
    // =====================================

    // Получить и подписать PSBT через Xverse
    const getAndSignPsbtXverse = async () => {
        if (!xverseConnected) {
            alert("Пожалуйста, сначала подключите Xverse кошелек.");
            return;
        }

        if (!lpId) {
            alert("Пожалуйста, введите ID launchpad.");
            return;
        }

        try {
            setStatus('Получение PSBT для launchpad через Xverse...');

            // Получение PSBT с API
            const psbtResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/${lpId}/psbt`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!psbtResponse.ok) {
                throw new Error(`Ошибка получения PSBT: ${psbtResponse.status} ${psbtResponse.statusText}`);
            }

            const psbtData = await psbtResponse.json();
            const psbtBase64 = psbtData.psbt;
            console.log('Xverse Received PSBT data:', psbtData);

            // Декодируем PSBT из Base64 и получаем количество входов
            const decodedPsbt = bitcoin.Psbt.fromBase64(psbtBase64);
            const inputCount = decodedPsbt.inputCount;
            console.log(`Xverse Количество входов: ${inputCount}`);

            const signInputs = {};

            if (xverseAddresses.length === 0) {
                alert("Нет доступных адресов для подписания в Xverse.");
                return;
            }

            // Получаем адрес для Ordinals
            const ordinalsAddressItem = xverseAddresses.find(
                (address) => address.purpose === AddressPurpose.Ordinals
            );

            if (!ordinalsAddressItem) {
                alert("Не удалось найти адрес для Ordinals в Xverse.");
                return;
            }

            const address = ordinalsAddressItem.address;
            signInputs[address] = Array.from({ length: inputCount }, (_, index) => index);
            console.log('Xverse signInputs:', signInputs);

            // Подписание PSBT через Xverse
            const signPsbtResponse = await request('signPsbt', {
                psbt: psbtBase64,
                signInputs: signInputs,
                allowedSighash: [1], // SIGHASH_ALL
            });

            if (signPsbtResponse.status === 'success') {
                const signedPsbt = signPsbtResponse.result.psbt;
                console.log('Xverse Signed PSBT:', signedPsbt);

                // Отправка подписанного PSBT на сохранение на сервер
                setStatus('Отправка подписанного PSBT на сервер через Xverse...');
                const saveResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/save`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        launchpadId: lpId,
                        signedListingPSBT: signedPsbt
                    })
                });

                if (!saveResponse.ok) {
                    throw new Error(`Ошибка отправки подписанного PSBT: ${saveResponse.status} ${saveResponse.statusText}`);
                }

                const saveData = await saveResponse.json();
                console.log("Xverse Save response:", saveData);
                setStatus("PSBT успешно подписан и отправлен через Xverse.");
            } else {
                if (signPsbtResponse.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил подписание PSBT через Xverse.");
                } else {
                    alert("Ошибка подписания PSBT через Xverse: " + signPsbtResponse.error.message);
                }
            }

        } catch (err) {
            console.error('Xverse Error:', err);
            setStatus(`Ошибка в Xverse: ${err.message}`);
        }
    };

    // Получить и подписать Buy PSBT через Xverse
    const getAndSignBuyPsbtXverse = async () => {
        if (!xverseConnected) {
            alert("Пожалуйста, сначала подключите Xverse кошелек.");
            return;
        }

        if (!lpId) {
            alert("Пожалуйста, введите ID launchpad.");
            return;
        }

        try {
            setStatus('Проверка паддингов...');

            // Шаг 1: Проверка наличия паддинговых UTXO через API
            const confirmResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/confirm-padding-outputs`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.address || ''
                })
            });

            if (!confirmResponse.ok) {
                throw new Error(`Ошибка подтверждения паддингов: ${confirmResponse.status} ${confirmResponse.statusText}`);
            }

            const confirmResult = await confirmResponse.json();
            console.log('Xverse Confirm Padding Outputs Response:', confirmResult);

            if (confirmResult.paddingOutputsExist) {
                // Если паддинги существуют, выполняем покупку NFT
                setStatus('Паддинги существуют. Переходим к покупке NFT...');
                await executeBuyNFTXverse();
            } else {
                // Если паддинги не существуют, настраиваем их
                setStatus('Паддинги не существуют. Настраиваем паддинги...');
                await setupPaddingOutputsXverse();
                // После настройки паддингов, выполняем покупку NFT
                await executeBuyNFTXverse();
            }

            setStatus('Процесс Mint завершен успешно.');
        } catch (error) {
            console.error('Xverse Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };
// Функция для настройки паддингов через Xverse
    const setupPaddingOutputsXverse = async () => {
        try {
            const feeRateTier = "standard"; // Пример значения
            const numOfOutPuts = 5;
            const paymentAddress = xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.address || '';
            const paymentPublicKey = xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.publicKey || '';

            setStatus('Настройка паддингов...');
            const setupResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/setup-padding-outputs`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: paymentAddress,
                    feeRateTier: feeRateTier,
                    numOfOutPuts: numOfOutPuts,
                    publicKey: paymentPublicKey
                })
            });

            if (!setupResponse.ok) {
                throw new Error(`Ошибка настройки паддингов: ${setupResponse.status} ${setupResponse.statusText}`);
            }

            const setupResult = await setupResponse.json();
            console.log('Xverse Setup Padding Outputs Response:', setupResult);

            if (!setupResult.psbt) {
                throw new Error('PSBT не найден в ответе настройки паддингов.');
            }

            if (!setupResult.buyerInputIndices || setupResult.buyerInputIndices.length === 0) {
                throw new Error('buyerInputIndices не найдены в ответе настройки паддингов.');
            }

            // Формирование toSignInputs на основе buyerInputIndices
            const toSignInputs = setupResult.buyerInputIndices.map(index => ({
                index: index,
                address: paymentAddress
            }));

            // Подписание PSBT через Xverse с указанием toSignInputs и автофинализацией
            setStatus('Подписание PSBT настройки паддингов через Xverse...');
            const signPsbtResponse = await request('signPsbt', {
                psbt: setupResult.psbt,
                signInputs: formatSignInputsMultiple(toSignInputs),
                allowedSighash: [1], // SIGHASH_ALL
                broadcast: true
            });

            if (signPsbtResponse.status === 'success') {
                const signedPsbt = signPsbtResponse.result.psbt;
                console.log('Xverse Signed Setup PSBT:', signedPsbt);


                setStatus(`Паддинги настроены и транзакция отправлена. TXID: ${signPsbtResponse}`);
            } else {
                if (signPsbtResponse.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил подписание PSBT настройки паддингов через Xverse.");
                } else {
                    alert("Ошибка подписания PSBT настройки паддингов через Xverse: " + signPsbtResponse.error.message);
                }
            }

        } catch (error) {
            throw new Error(`Setup Padding Outputs Error: ${error.message}`);
        }
    };
// Функция для покупки NFT через Xverse
    const executeBuyNFTXverse = async () => {
        try {
            setStatus('Инициация покупки NFT через Xverse...');

            const buyerPaymentAddress = xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.address || '';
            const buyerPaymentPublicKey = xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.publicKey || '';

            const buyNftPayload = {
                buyerOrdinalAddress: xverseAddresses.find(addr => addr.purpose === AddressPurpose.Ordinals)?.address || '',
                buyerPaymentAddress: buyerPaymentAddress,
                buyerPaymentPublicKey: buyerPaymentPublicKey,
                launchpadId: lpId
            };

            const buyResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/buy-nft`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(buyNftPayload)
            });

            if (!buyResponse.ok) {
                throw new Error(`Ошибка покупки NFT: ${buyResponse.status} ${buyResponse.statusText}`);
            }

            const buyData = await buyResponse.json();
            console.log('Xverse Buy NFT Response:', buyData);

            const psbtBase64 = buyData.psbt;

            if (!psbtBase64 || !buyData.buyerInputIndices) {
                throw new Error('Неверный ответ при покупке NFT.');
            }

            // Формирование toSignInputs на основе buyerInputIndices
            const toSignInputs = buyData.buyerInputIndices.map(index => ({
                index: index,
                address: buyerPaymentAddress
            }));

            // Подписание PSBT покупки через Xverse
            setStatus('Подписание PSBT покупки NFT через Xverse...');
            const signPsbtResponse = await request('signPsbt', {
                psbt: psbtBase64,
                signInputs: signInputsFormatter(toSignInputs),
                allowedSighash: [1], // SIGHASH_ALL
            });

            if (signPsbtResponse.status === 'success') {
                const signedPsbt = signPsbtResponse.result.psbt;
                console.log('Xverse Signed Buy NFT PSBT:', signedPsbt);

                // Отправка подписанного PSBT на сервер для завершения покупки
                setStatus('Отправка подписанного PSBT покупки NFT на сервер через Xverse...');
                const saveResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/submit-launch-offer`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        launchpadId: lpId,
                        ordinalId: buyData.ordinalId,
                        signedBuyerPSBTBase64: signedPsbt
                    })
                });

                if (!saveResponse.ok) {
                    throw new Error(`Ошибка отправки подписанного PSBT для покупки NFT: ${saveResponse.status} ${saveResponse.statusText}`);
                }

                const saveData = await saveResponse.json();
                console.log("Xverse Submit Launch Offer Response:", saveData);
                setStatus("PSBT покупки NFT успешно подписан и отправлен через Xverse.");
            } else {
                if (signPsbtResponse.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил подписание PSBT покупки NFT через Xverse.");
                } else {
                    alert("Ошибка подписания PSBT покупки NFT через Xverse: " + signPsbtResponse.error.message);
                }
            }

        } catch (err) {
            console.error('Xverse Buy NFT Error:', err);
            setStatus(`Ошибка покупки NFT через Xverse: ${err.message}`);
        }
    };
// Функция для подписания signInputs через Xverse и UniSat
    const signInputsFormatter = (toSignInputs) => {
        // Преобразование массива объектов в необходимый формат
        const formatted = {};
        toSignInputs.forEach(input => {
            if (!formatted[input.address]) {
                formatted[input.address] = [];
            }
            formatted[input.address].push(input.index);
        });
        return formatted;
    };

    // =====================================
    // Функции для UniSat Wallet
    // =====================================

    // Функция Mint через UniSat
    const mintWithUniSat = async () => {
        if (!uniSatConnected) {
            alert("Пожалуйста, сначала подключите UniSat Wallet.");
            return;
        }

        if (!lpId) {
            alert("Пожалуйста, введите ID launchpad.");
            return;
        }

        try {
            setStatus('Проверка паддингов...');

            // Шаг 1: Проверка наличия паддинговых UTXO
            const confirmResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/confirm-padding-outputs`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: uniSatAddress
                })
            });

            if (!confirmResponse.ok) {
                throw new Error(`Ошибка подтверждения паддингов: ${confirmResponse.status} ${confirmResponse.statusText}`);
            }

            const confirmResult = await confirmResponse.json();
            console.log('UniSat Confirm Padding Outputs Response:', confirmResult);

            if (confirmResult.paddingOutputsExist) {
                // Если паддинги существуют, выполняем покупку NFT
                setStatus('Паддинги существуют. Переходим к покупке NFT...');
                await buyNFTUniSat(lpId);
            } else {
                // Если паддинги не существуют, настраиваем их
                setStatus('Паддинги не существуют. Настраиваем паддинги...');
                await setupPaddingOutputsUniSat(lpId);
                // После настройки паддингов, выполняем покупку NFT
                await buyNFTUniSat(lpId);
            }

            setStatus('Процесс Mint завершен успешно.');
        } catch (error) {
            console.error('UniSat Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };

    /**
     * Функция для настройки паддингов через UniSat
     */
    const setupPaddingOutputsUniSat = async (launchpadId) => {
        try {
            const feeRateTier = "standard"; // Пример значения
            const numOfOutPuts = 5;

            setStatus('Настройка паддингов...');
            const setupResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/setup-padding-outputs`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: uniSatAddress,
                    feeRateTier: feeRateTier,
                    numOfOutPuts: numOfOutPuts,
                    publicKey: uniSatPublicKey
                })
            });

            if (!setupResponse.ok) {
                throw new Error(`Ошибка настройки паддингов: ${setupResponse.status} ${setupResponse.statusText}`);
            }

            const setupResult = await setupResponse.json();
            console.log('UniSat Setup Padding Outputs Response:', setupResult);

            if (!setupResult.psbt) {
                throw new Error('PSBT не найден в ответе настройки паддингов.');
            }

            if (!setupResult.buyerInputIndices || setupResult.buyerInputIndices.length === 0) {
                throw new Error('buyerInputIndices не найдены в ответе настройки паддингов.');
            }

            // Формирование toSignInputs на основе buyerInputIndices
            const toSignInputs = setupResult.buyerInputIndices.map(index => ({
                index: index,
                address: uniSatAddress
            }));

            // Подписание PSBT через UniSat с указанием toSignInputs и автофинализацией
            setStatus('Подписание PSBT через UniSat...');
            const signedPsbtHex = await window.unisat.signPsbt(setupResult.psbt, {
                autoFinalized: true, // Автофинализация
                toSignInputs: toSignInputs
            });
            console.log('UniSat Signed Setup PSBT (Hex):', signedPsbtHex);

            if (!signedPsbtHex) {
                throw new Error('Подписание PSBT не удалось.');
            }

            // Отправка подписанного PSBT в блокчейн через UniSat
            setStatus('Отправка подписанной PSBT в блокчейн...');
            const txid = await window.unisat.pushPsbt(signedPsbtHex);
            console.log('UniSat Transaction ID:', txid);

            if (!txid) {
                throw new Error('Отправка PSBT в блокчейн не удалась.');
            }

            setStatus(`Транзакция успешно отправлена. TXID: ${txid}`);
        } catch (error) {
            throw new Error(`Setup Padding Outputs Error: ${error.message}`);
        }
    };

    /**
     * Функция для покупки NFT через UniSat
     */
    const buyNFTUniSat = async (launchpadId) => {
        try {
            setStatus('Инициация покупки NFT...');

            const buyerPaymentAddress = uniSatAddress; // Пример значения
            const buyerPaymentPublicKey = uniSatPublicKey; // Используем публичный ключ пользователя

            const buyNftPayload = {
                buyerOrdinalAddress: uniSatAddress,
                buyerPaymentAddress: buyerPaymentAddress,
                buyerPaymentPublicKey: buyerPaymentPublicKey,
                launchpadId: launchpadId
            };

            const buyResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/buy-nft`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(buyNftPayload)
            });

            if (!buyResponse.ok) {
                throw new Error(`Ошибка покупки NFT: ${buyResponse.status} ${buyResponse.statusText}`);
            }

            const buyResult = await buyResponse.json();
            console.log('UniSat Buy NFT Response:', buyResult);

            const psbtBase64 = buyResult.psbt;

            if (!psbtBase64 || !buyResult.buyerInputIndices) {
                throw new Error('Неверный ответ при покупке NFT.');
            }

            // Формирование toSignInputs на основе buyerInputIndices
            const toSignInputs = buyResult.buyerInputIndices.map(index => ({
                index: index,
                address: uniSatAddress
            }));

            // Подписание PSBT покупки через UniSat
            setStatus('Подписание PSBT покупки NFT через UniSat...');
            const signedBuyPsbtHex = await window.unisat.signPsbt(psbtBase64, {
                autoFinalized: false, // Автофинализация
                toSignInputs: toSignInputs
            });

            if (!signedBuyPsbtHex) {
                throw new Error('Подписание PSBT покупки NFT не удалось.');
            }

            const signedBuyPsbtBase64 = hexToBase64(signedBuyPsbtHex);
            console.log('UniSat Signed Buy NFT PSBT (Base64):', signedBuyPsbtBase64);

            // Отправка подписанного PSBT на сервер для завершения покупки
            setStatus('Отправка подписанного PSBT покупки NFT на сервер...');
            const submitOfferResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/submit-launch-offer`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    launchpadId: launchpadId,
                    ordinalId: buyResult.ordinalId, // Предполагается, что ordinalId приходит в ответе
                    signedBuyerPSBTBase64: signedBuyPsbtBase64
                })
            });

            if (!submitOfferResponse.ok) {
                throw new Error(`Ошибка отправки предложения запуска: ${submitOfferResponse.status} ${submitOfferResponse.statusText}`);
            }

            const submitOfferResult = await submitOfferResponse.json();
            console.log('UniSat Submit Launch Offer Response:', submitOfferResult);

            setStatus(`Mint успешно выполнен. Детали транзакции: ${JSON.stringify(submitOfferResult)}`);
        } catch (error) {
            throw new Error(`Buy NFT Error: ${error.message}`);
        }
    };

    // =====================================
    // Функции для UniSat Wallet - Получение и Подписание PSBT
    // =====================================

    const getAndSignPsbtUniSat = async () => {
        if (!uniSatConnected) {
            alert("Пожалуйста, сначала подключите UniSat Wallet.");
            return;
        }

        if (!lpId) {
            alert("Пожалуйста, введите ID launchpad.");
            return;
        }

        try {
            setStatus('Получение PSBT для launchpad через UniSat...');

            // Получение PSBT с API
            const psbtResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/${lpId}/psbt`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!psbtResponse.ok) {
                throw new Error(`Ошибка получения PSBT: ${psbtResponse.status} ${psbtResponse.statusText}`);
            }

            const psbtData = await psbtResponse.json();
            const psbtBase64 = psbtData.psbt;
            console.log('UniSat Received PSBT data:', psbtData);

            // Декодируем PSBT из Base64 и получаем количество входов
            const decodedPsbt = bitcoin.Psbt.fromBase64(psbtBase64);
            const inputCount = decodedPsbt.inputCount;
            console.log(`UniSat Количество входов: ${inputCount}`);

            // Формирование signInputs для подписания всех входов
            const signInputs = {};
            signInputs[uniSatAddress] = Array.from({ length: inputCount }, (_, index) => index);
            console.log('UniSat signInputs:', signInputs);

            // Подписание PSBT через UniSat
            const signedPsbtHex = await window.unisat.signPsbt(psbtBase64, {
                autoFinalized: false, // Автофинализация
                toSignInputs: signInputs[uniSatAddress].map(index => ({
                    index: index,
                    address: uniSatAddress
                }))
            });

            if (!signedPsbtHex) {
                throw new Error('Подписание PSBT через UniSat не удалось.');
            }

            console.log('UniSat Signed PSBT (Hex):', signedPsbtHex);

            // Конвертация подписанного PSBT из Hex в Base64
            const signedPsbtBase64 = hexToBase64(signedPsbtHex);
            console.log('UniSat Signed PSBT (Base64):', signedPsbtBase64);

            // Отправка подписанного PSBT на сервер для сохранения
            setStatus('Отправка подписанного PSBT на сервер через UniSat...');
            const saveResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/save`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    launchpadId: lpId,
                    signedListingPSBT: signedPsbtBase64
                })
            });

            if (!saveResponse.ok) {
                throw new Error(`Ошибка отправки подписанного PSBT: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            const saveData = await saveResponse.json();
            console.log("UniSat Save response:", saveData);
            setStatus("PSBT успешно подписан и отправлен через UniSat.");
        } catch (error) {
            console.error('UniSat getAndSignPsbt Error:', error);
            setStatus(`Ошибка в UniSat getAndSignPsbt: ${error.message}`);
        }
    };

    // =====================================
    // Общие Функции
    // =====================================

    // Форматирование signInputs
    const formatSignInputs = (address, buyerInputIndices) => {
        let signInputs = {};
        signInputs[address] = buyerInputIndices;
        return signInputs;
    };
    const formatSignInputsMultiple = (toSignInputs) => {
        // Преобразование массива объектов в необходимый формат
        const formatted = {};
        toSignInputs.forEach(input => {
            if (!formatted[input.address]) {
                formatted[input.address] = [];
            }
            formatted[input.address].push(input.index);
        });
        return formatted;
    };
    return (
        <div style={{ padding: '20px' }}>
            <h1>Xverse & UniSat Wallet PSBT Signer</h1>

            {/* Подключение Xverse кошелька */}
            <div style={{ marginBottom: '20px' }}>
                {!xverseConnected ? (
                    <button onClick={connectXverse}>Подключить Xverse кошелек</button>
                ) : (
                    <p>✅ Xverse кошелек подключен.</p>
                )}
            </div>

            {/* Подключение UniSat кошелька */}
            <div style={{ marginBottom: '20px' }}>
                {!uniSatConnected ? (
                    <button onClick={connectUniSat}>Подключить UniSat Wallet</button>
                ) : (
                    <p>✅ UniSat Wallet подключен: {uniSatAddress}</p>
                )}
            </div>

            {/* Ввод ID Launchpad */}
            <div>
                <label>ID Launchpad: </label>
                <input type="text" value={lpId} onChange={handleLpIdChange} />
            </div>

            {/* Действия для Xverse кошелька */}
            {xverseConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtXverse}>Получить и подписать PSBT (Xverse)</button>
                    <button onClick={getAndSignBuyPsbtXverse}>Заминтить NFT (Xverse)</button>
                </div>
            )}

            {/* Действия для UniSat кошелька */}
            {uniSatConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtUniSat}>Получить и подписать PSBT (UniSat)</button>
                    <button onClick={mintWithUniSat}>Mint (UniSat)</button>
                </div>
            )}

            {/* Блок статуса */}
            <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc', minHeight: '50px', whiteSpace: 'pre-wrap', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <strong>Status:</strong> {status || 'Ожидание действий.'}
            </div>
        </div>
    );
}

export default App;
