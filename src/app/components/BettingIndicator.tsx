'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getMarketInfo, MarketState } from '../lib/contractsApi';
import type { MarketDataType } from '../../types/types';
import { FaBullseye } from 'react-icons/fa';

interface BettingIndicatorProps {
  livestreamId: number;
  market?: MarketDataType;
  className?: string;
}

const BettingIndicator: React.FC<BettingIndicatorProps> = ({ livestreamId, market, className = '' }) => {
  const [hasActiveMarket, setHasActiveMarket] = useState(false);
  const [totalPool, setTotalPool] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadMarketStatus = useCallback(async () => {
    try {
      setIsLoading(true);

      console.log(`📊 BettingIndicator: Loading status for livestream ${livestreamId} with market:`, market);

      if (!market || !market.contract_address) {
        console.log(`No market found for livestream ${livestreamId}`);
        setHasActiveMarket(false);
        setTotalPool(0);
        return;
      }

      try {
        console.log(`📡 Fetching on-chain data for market ${market.contract_address}`);
        const info = await getMarketInfo(market.contract_address);
        console.log(`📈 Market info:`, info);

        const stateNumber = Number(info.state);

        if (stateNumber === MarketState.Open) {
          setHasActiveMarket(true);
          const poolAmount = parseFloat(info.totalPool) || 0;
          setTotalPool(poolAmount);
          console.log(`✅ BettingIndicator: Active market with pool ${poolAmount} FLOW`);
        } else {
          setHasActiveMarket(false);
          setTotalPool(0);
          console.log(`❌ BettingIndicator: Market closed (state: ${stateNumber})`);
        }
      } catch (contractError) {
        console.error(`❌ Could not fetch on-chain data for ${market.contract_address}:`, contractError);

        if (market.state !== undefined && market.state === 0) {
          console.log(`🔄 Using backend data as fallback`);
          setHasActiveMarket(true);
          const yesAmount = parseFloat(market.yes_bets || '0');
          const noAmount = parseFloat(market.no_bets || '0');
          setTotalPool(yesAmount + noAmount);
        } else {
          setHasActiveMarket(false);
          setTotalPool(0);
        }
      }
    } catch (error) {
      console.error('Error loading market status:', error);
      setHasActiveMarket(false);
      setTotalPool(0);
    } finally {
      setIsLoading(false);
    }
  }, [livestreamId, market]);

  useEffect(() => {
    loadMarketStatus();
  }, [loadMarketStatus]);

  if (isLoading) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
        <span className="text-xs text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!hasActiveMarket) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
        <span className="text-xs text-gray-500">No active market</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      <span className="text-xs text-green-600 font-medium">
        Active market • {totalPool.toFixed(2)} FLOW
      </span>
    </div>
  );
};

export default BettingIndicator;
