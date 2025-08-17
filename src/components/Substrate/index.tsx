import { AsciiDie, SubstrateDefectXlsResult, WaferMapDie } from "@/types/ipc";
import { Box, Flex } from "@mantine/core";
import { useState } from "react";
import SubstrateRenderer from "./Wafer";
import Parameters from "./Parameters";

type SubstratePaneProps = {
    oemProductId: string;
    showParameters?: boolean;
    sheetsData: SubstrateDefectXlsResult;
    dieData: (AsciiDie | WaferMapDie)[];
};

export default function SubstratePane({ oemProductId, showParameters = false, sheetsData, dieData }: SubstratePaneProps) {
    const [dieX, setDieX] = useState(1);
    const [dieY, setDieY] = useState(1);
    const [xOffset, setXOffset] = useState(0); // mm
    const [yOffset, setYOffset] = useState(0); // mm

    return (
        <Flex gap="md" style={{ height: "calc(100vh - 50px)", width: "100%" }}>
            {/* Left controls (DB-backed offsets) */}
            {showParameters && <Parameters
                oemProductId={oemProductId}
                minDie={0}
                maxDie={10}
                onDieSizeChange={({ dieX,  dieY }) => {
                    setDieX(dieX);
                    setDieY(dieY);
                }}
                minOffset={-10}
                maxOffset={10}
                onOffsetsChange={({ x, y }) => {
                    setXOffset(x);
                    setYOffset(y);
                }}
            />}

            {/* Right renderer */}
            <Box style={{ flex: 1, minWidth: 0 }}>
                {sheetsData && dieData && (
                    <SubstrateRenderer
                        gridWidth={dieX}
                        gridHeight={dieY}
                        dies={dieData}
                        selectedSheetId="Surface defect list"
                        sheetsData={sheetsData}
                        gridOffset={{ x: xOffset, y: yOffset }}
                        // keep full height on the right side
                        style={{ height: "100%", width: "100%" }}
                    />
                )}
            </Box>
        </Flex>
    );
}
