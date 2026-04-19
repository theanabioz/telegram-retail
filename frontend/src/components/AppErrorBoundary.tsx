import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, Text, VStack } from "@chakra-ui/react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <Box minH="var(--app-viewport-height, 100vh)" px={5} pt="var(--app-screen-pt)" display="grid" placeItems="center">
        <VStack
          spacing={4}
          textAlign="center"
          bg="rgba(255,255,255,0.88)"
          borderRadius="28px"
          px={6}
          py={7}
          boxShadow="0 18px 36px rgba(18, 18, 18, 0.06)"
        >
          <Text fontSize="xl" fontWeight="900" letterSpacing="-0.03em">
            Something went wrong
          </Text>
          <Text color="surface.500" fontSize="sm" fontWeight="700" maxW="280px">
            The screen crashed, but the app stayed alive. Please reopen this section.
          </Text>
          <Button
            borderRadius="18px"
            bg="surface.900"
            color="white"
            _hover={{ bg: "surface.800" }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
        </VStack>
      </Box>
    );
  }
}
