'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import {
  getMarketInfo,
  placeBet,
  getUserBets,
  getMarketOdds,
  createMarket,
  claimPayout,
  MarketState,
  MarketInfo,
  UserBets,
  MarketOdds,
} from '../lib/contractsApi';
import type { MarketDataType } from '../../types/types';

interface BettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  livestreamId: number;
  livestreamTitle: string;
  livestreamDescription?: string;
  markets?: MarketDataType[];
  market?: MarketDataType;
}

const BettingModal: React.FC<BettingModalProps> = ({
  isOpen,
  onClose,
  livestreamId,
  livestreamTitle,
  livestreamDescription,
  markets,
  market,
}) => {
  const { ready, authenticated, user } = usePrivy();

  // Market state
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null);
  const [userBets, setUserBets] = useState<UserBets>({ livestreamIds: [], amounts: [] });
  const [marketOdds, setMarketOdds] = useState<MarketOdds>({ livestreamBets: [] });

  // Betting state
  const [betAmount, setBetAmount] = useState<string>('0.1');
  const [sliderValue, setSliderValue] = useState<number>(10);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Market creation state
  const [showCreateMarket, setShowCreateMarket] = useState(false);
  const [newMarketQuestion, setNewMarketQuestion] = useState('');
  const [isCreatingMarket, setIsCreatingMarket] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // loadMarkets
  // ---------------------------------------------------------------
  const loadMarkets = useCallback(async () => {
    try {
      console.log(`🔍 BettingModal: Loading markets for livestream ${livestreamId}...`);
      console.log(`📊 Markets data:`, market);

      if (market && market.contract_address) {
        console.log(`✅ Found market ${market.contract_address}`);
        setSelectedMarketId(market.id);
        setShowCreateMarket(false);
      } else {
        console.log(`⚠️ No market found for livestream ${livestreamId}, showing create market interface`);
        setNewMarketQuestion(`Which hackathon project will win?`);
        setShowCreateMarket(true);
      }
    } catch (err) {
      console.error('Error loading markets:', err);
      setError('Failed to load markets');
    }
  }, [livestreamId, market]);

  // ---------------------------------------------------------------
  // loadMarketInfo
  // ---------------------------------------------------------------
  const loadMarketInfo = useCallback(async () => {
    if (!selectedMarketId) return;

    try {
      setIsLoading(true);
      setError(null);
      console.log(`📊 Loading market info for market ${selectedMarketId}...`);

      const marketData = market && market.id === selectedMarketId ? market : null;

      if (marketData && marketData.state !== undefined) {
        console.log(`✅ Using backend market data for market ${selectedMarketId}`);
        setMarketInfo({
          livestreamIds: [livestreamId],
          question: marketData.question || `Which hackathon project will win?`,
          livestreamTitles: [livestreamTitle],
          state: marketData.state as MarketState,
          winningLivestreamId: 0,
          totalPool: marketData.total_pool || '0',
          totalBettors: 0,
          createdAt: marketData.created_at ? new Date(marketData.created_at).getTime() : Date.now(),
          closedAt: 0,
          resolvedAt: marketData.state === 2 ? Date.now() : 0,
        });

        setMarketOdds({ livestreamBets: [] });
      } else {
        console.log(`📡 Fetching on-chain data for market ${selectedMarketId}...`);
        const [info, odds] = await Promise.all([
          getMarketInfo(selectedMarketId.toString()),
          getMarketOdds(selectedMarketId.toString()),
        ]);
        setMarketInfo(info);
        setMarketOdds(odds);
      }

      if (authenticated && user?.wallet?.address) {
        try {
          const bets = await getUserBets(selectedMarketId.toString(), user.wallet.address);
          setUserBets(bets);
        } catch (err) {
          console.warn('Could not load user bets:', err);
          setUserBets({ livestreamIds: [], amounts: [] });
        }
      }
    } catch (err) {
      console.error('Error loading market info:', err);
      setError('Failed to load market information');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMarketId, market, livestreamId, livestreamTitle, authenticated, user?.wallet?.address]);

  // ---------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      // Always set the current livestream as selected for betting
      setSelectedMarketId(null); // reset before loading so loadMarketInfo doesn't fire with stale id
      loadMarkets();
    }
  }, [isOpen, livestreamId, loadMarkets]);

  useEffect(() => {
    if (selectedMarketId && isOpen) {
      loadMarketInfo();
    }
  }, [selectedMarketId, isOpen, loadMarketInfo]);

  // ---------------------------------------------------------------
  // Slider / amount helpers
  // ---------------------------------------------------------------
  const convertSliderToFlow = (value: number) => {
    const flowAmount = (value / 100) * 10;
    return Math.max(0.01, flowAmount);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setSliderValue(value);
    setBetAmount(convertSliderToFlow(value).toFixed(2));
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setBetAmount(value);
    const flowValue = parseFloat(value) || 0;
    const sliderVal = Math.min(100, Math.max(1, (flowValue / 10) * 100));
    setSliderValue(sliderVal);
  };

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------
  const handlePlaceBet = async () => {
    if (!selectedMarketId || !authenticated || !user?.wallet?.address || !livestreamId) {
      setError('Please connect your wallet and select a project to bet on');
      return;
    }

    try {
      setIsPlacingBet(true);
      setError(null);
      setSuccess(null);

      console.log(`🎯 Placing bet: ${betAmount} FLOW on livestream ${livestreamId} in market ${selectedMarketId}`);
      await placeBet(selectedMarketId.toString(), livestreamId, betAmount);

      setSuccess(`Bet placed successfully! 🎉`);
      await loadMarketInfo();
      setBetAmount('0.1');
      setSliderValue(10);
    } catch (err) {
      console.error('Error placing bet:', err);
      setError(err instanceof Error ? err.message : 'Failed to place bet. Please try again.');
    } finally {
      setIsPlacingBet(false);
    }
  };

  const handleCreateMarket = async () => {
    if (!authenticated || !user?.wallet?.address || !newMarketQuestion.trim()) {
      setError('Please connect your wallet and enter a market question');
      return;
    }

    try {
      setIsCreatingMarket(true);
      setError(null);
      setSuccess(null);

      console.log(`🏗️ Creating market: ${newMarketQuestion}`);
      const result = await createMarket(
        newMarketQuestion,
        livestreamTitle,
        livestreamDescription || '',
        'hackathon',
        [],
        [livestreamId],
        [livestreamTitle]
      );

      if (result.success && result.marketAddress) {
        setSuccess(`Market created successfully! 🎉`);
        setSelectedMarketId(Number(result.marketAddress));
        setShowCreateMarket(false);
        await loadMarketInfo();
      } else {
        setError(result.error || 'Failed to create market');
      }
    } catch (err) {
      console.error('Error creating market:', err);
      setError(err instanceof Error ? err.message : 'Failed to create market. Please try again.');
    } finally {
      setIsCreatingMarket(false);
    }
  };

  const handleClaimPayout = async () => {
    if (!selectedMarketId || !authenticated || !user?.wallet?.address) {
      setError('Please connect your wallet to claim payout');
      return;
    }

    try {
      setIsClaiming(true);
      setError(null);
      setSuccess(null);

      console.log(`💰 Claiming payout from market ${selectedMarketId}`);
      await claimPayout(selectedMarketId.toString());

      setSuccess(`Payout claimed successfully! 💰`);
      await loadMarketInfo();
    } catch (err) {
      console.error('Error claiming payout:', err);
      setError(err instanceof Error ? err.message : 'Failed to claim payout. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  if (!isOpen) return null;

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">🎯 Place Your Bet</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">{livestreamTitle}</p>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-700 text-xs sm:text-sm">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-green-700 text-xs sm:text-sm">{success}</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-4">
              <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-600 text-xs sm:text-sm">Loading market information...</p>
            </div>
          )}

          {markets && markets.length > 0 && (
            <div className="mb-4">
              <label htmlFor="market-select" className="block text-xs font-semibold mb-1">Select Market</label>
              <select
                id="market-select"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-xs sm:text-sm bg-white text-gray-900 placeholder-gray-400"
                value={selectedMarketId ?? ''}
                onChange={(e) => setSelectedMarketId(Number(e.target.value))}
              >
                <option value="" disabled>Select a market...</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
          )}

          {showCreateMarket && !isLoading && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Market Question
                </label>
                <input
                  type="text"
                  value={newMarketQuestion}
                  onChange={(e) => setNewMarketQuestion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-xs sm:text-sm bg-white text-gray-900 placeholder-gray-400"
                  placeholder="e.g., Which hackathon project will win?"
                />
              </div>

              <button
                onClick={handleCreateMarket}
                disabled={isCreatingMarket || !newMarketQuestion.trim() || !authenticated}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 sm:py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center text-xs sm:text-sm"
              >
                {isCreatingMarket ? (
                  <>
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span className="hidden sm:inline">Creating Market...</span>
                    <span className="sm:hidden">Creating...</span>
                  </>
                ) : (
                  <>
                    <span className="mr-2">🏗️</span>
                    <span className="hidden sm:inline">Create Market</span>
                    <span className="sm:hidden">Create</span>
                  </>
                )}
              </button>
            </div>
          )}

          {!showCreateMarket && !isLoading && marketInfo && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">{marketInfo.question}</h3>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    Pool: {parseFloat(marketInfo.totalPool).toFixed(2)} FLOW
                  </span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    Bettors: {marketInfo.totalBettors}
                  </span>
                  <span
                    className={`px-2 py-1 rounded ${
                      marketInfo.state === 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : marketInfo.state === 1
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {marketInfo.state === 0 ? 'Open' : marketInfo.state === 1 ? 'Closed' : 'Resolved'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Bet Amount (FLOW)
                </label>
                <div className="space-y-3">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={handleAmountChange}
                    min="0.01"
                    max="10"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-xs sm:text-sm"
                    placeholder="0.1"
                  />
                  <div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={sliderValue}
                      onChange={handleSliderChange}
                      className="w-full slider"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0.01 FLOW</span>
                      <span>10 FLOW</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {marketInfo.state === 0 && (
                  <button
                    onClick={handlePlaceBet}
                    disabled={isPlacingBet || !authenticated || parseFloat(betAmount) <= 0}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 sm:py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center text-xs sm:text-sm"
                  >
                    {isPlacingBet ? (
                      <>
                        <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        <span className="hidden sm:inline">Placing Bet...</span>
                        <span className="sm:hidden">Placing...</span>
                      </>
                    ) : (
                      <>
                        <span className="mr-2">🎯</span>
                        <span className="hidden sm:inline">Place Bet</span>
                        <span className="sm:hidden">Bet</span>
                      </>
                    )}
                  </button>
                )}

                {marketInfo.state === 2 && userBets.amounts.length > 0 && (
                  <button
                    onClick={handleClaimPayout}
                    disabled={isClaiming || !authenticated}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 sm:py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center text-xs sm:text-sm"
                  >
                    {isClaiming ? (
                      <>
                        <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        <span className="hidden sm:inline">Claiming Payout...</span>
                        <span className="sm:hidden">Claiming...</span>
                      </>
                    ) : (
                      <>
                        <span className="mr-2">💰</span>
                        <span className="hidden sm:inline">Claim Payout</span>
                        <span className="sm:hidden">Claim</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {userBets.amounts.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <h4 className="text-xs sm:text-sm font-semibold text-blue-900 mb-2">Your Bets</h4>
                  <div className="space-y-1">
                    {userBets.livestreamIds.map((id, index) => (
                      <div key={index} className="flex justify-between text-xs">
                        <span>Project {id}:</span>
                        <span className="font-medium">{userBets.amounts[index]} FLOW</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ETHGlobal Faucet Button */}
          <div className="mt-2 flex justify-center">
            <a
              href="https://ethglobal.com/faucet"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-green-600 text-white rounded font-semibold shadow hover:bg-green-700 transition-colors border border-green-700 flex items-center gap-2"
            >
              <Image
                src="https://cdn.prod.website-files.com/64b8433b6f2d35c03d44ffc0/64ca7d6fe695a4527633da1a_Group%2047467.png"
                alt="Flow Logo"
                width={20}
                height={20}
              />
              Get Flow Testnet Tokens
            </a>
          </div>

          <div className="mt-4 text-center">
            <a
              href="https://faucet.testnet.onflow.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-xs font-semibold border border-blue-300"
            >
              Need testnet FLOW? Get some from the Flow Faucet
            </a>
          </div>

          {!authenticated && (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">🔒</div>
              <p className="text-gray-600 text-xs sm:text-sm mb-3">Connect your wallet to place bets</p>
              <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs sm:text-sm">
                Connect Wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BettingModal;
